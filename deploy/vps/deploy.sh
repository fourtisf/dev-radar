#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# DevRadar — one-shot VPS deploy (Ubuntu/Debian, run as root).
#
# What it does, in order:
#   1. Stops + DELETES old pm2 apps (pumpterminal-*) — AFTER taking a
#      full tar backup of each app folder to /root/backups/
#   2. Installs Docker + compose plugin if missing; ensures swap
#   3. Extracts /root/devradar.tgz → /opt/devradar
#   4. Bootstraps .env (generates JWT + webhook secrets)
#   5. Starts postgres + redis, builds + starts web & worker
#      (worker applies prisma migrations on boot), seeds labels
#   6. Smoke-tests and prints what to do next
#
# Usage (on the VPS):
#   upload devradar.tgz to /root/  then:
#   bash /root/deploy.sh                 # full run
#   KEEP_OLD=1 bash /root/deploy.sh     # skip the pm2/old-folder wipe
# ════════════════════════════════════════════════════════════════
set -euo pipefail

TARBALL="${TARBALL:-/root/devradar.tgz}"
APP_DIR="${APP_DIR:-/opt/devradar}"
BACKUP_DIR="/root/backups"
PUBLIC_IP="$(hostname -I | awk '{print $1}')"
STAMP="$(date +%Y%m%d-%H%M%S)"

log()  { echo -e "\n\033[1;33m── $*\033[0m"; }
ok()   { echo -e "\033[1;32m   ✓ $*\033[0m"; }
fail() { echo -e "\033[1;31m   ✗ $*\033[0m"; exit 1; }

[ "$(id -u)" = "0" ] || fail "run as root"

# ── 1. Old project: backup → stop → remove ──────────────────────
if [ "${KEEP_OLD:-0}" != "1" ] && command -v pm2 >/dev/null 2>&1; then
  log "Backing up + removing old pm2 apps"
  mkdir -p "$BACKUP_DIR"

  # Old app folders, taken from pm2's own process metadata (cwd).
  mapfile -t OLD_DIRS < <(pm2 jlist 2>/dev/null \
    | python3 -c 'import json,sys; [print(p["pm2_env"].get("pm_cwd","")) for p in json.load(sys.stdin)]' \
    | sort -u | grep -v '^$' || true)

  for d in "${OLD_DIRS[@]}"; do
    if [ -d "$d" ] && [ "$d" != "/" ] && [ "$d" != "/root" ] && [ "$d" != "$APP_DIR" ]; then
      name="$(basename "$d")"
      tar czf "$BACKUP_DIR/${name}-${STAMP}.tgz" -C "$(dirname "$d")" "$name" \
        --exclude="$name/node_modules" --exclude="$name/.next" 2>/dev/null || true
      ok "backup: $BACKUP_DIR/${name}-${STAMP}.tgz"
    fi
  done

  pm2 delete all >/dev/null 2>&1 || true
  pm2 save --force >/dev/null 2>&1 || true
  ok "pm2 apps stopped & removed from startup list"

  # Fallback: catch old project folders even if pm2 metadata was empty.
  for g in /root/pumpterminal* /opt/pumpterminal* /var/www/pumpterminal* /home/*/pumpterminal*; do
    [ -d "$g" ] && OLD_DIRS+=("$g")
  done

  for d in "${OLD_DIRS[@]}"; do
    if [ -d "$d" ] && [ "$d" != "/" ] && [ "$d" != "/root" ] && [ "$d" != "$APP_DIR" ]; then
      name="$(basename "$d")"
      [ -f "$BACKUP_DIR/${name}-${STAMP}.tgz" ] || tar czf "$BACKUP_DIR/${name}-${STAMP}.tgz" -C "$(dirname "$d")" "$name" \
        --exclude="$name/node_modules" --exclude="$name/.next" 2>/dev/null || true
      rm -rf "$d"
      ok "removed: $d (backup in $BACKUP_DIR)"
    fi
  done
else
  log "Skipping old-app cleanup (KEEP_OLD=1 or no pm2)"
fi

# ── 2. Docker + swap ─────────────────────────────────────────────
log "Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
docker compose version >/dev/null 2>&1 || fail "docker compose plugin missing"
systemctl enable --now docker >/dev/null 2>&1 || true
ok "$(docker --version)"

TOTAL_MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$TOTAL_MEM_MB" -lt 3800 ] && [ ! -f /swapfile ]; then
  log "RAM ${TOTAL_MEM_MB}MB — adding 2G swap for the Next.js build"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "swap on"
fi

# ── 2.5 Free the ports DevRadar needs ────────────────────────────
log "Freeing ports 5432 / 6379 / 3000 / 8787"
mkdir -p "$BACKUP_DIR"
# host-level services from old stacks
systemctl disable --now redis-server redis postgresql 2>/dev/null || true
pkill -x redis-server 2>/dev/null || true
# leftover docker state from previous attempts of THIS stack
(cd "$APP_DIR" 2>/dev/null && docker compose down --remove-orphans >/dev/null 2>&1) || true
# old-project containers still publishing our ports (volumes are kept)
for port in 5432 6379 3000 8787; do
  for c in $(docker ps -q --filter "publish=${port}"); do
    name="$(docker inspect -f '{{.Name}}' "$c" | tr -d '/')"
    case "$name" in
      devradar-*) ;;
      *) docker rm -f "$c" >/dev/null && ok "removed old container ${name} (held :${port})" ;;
    esac
  done
done
rm -f "$APP_DIR/dump.rdb" 2>/dev/null || true
sleep 1
for port in 6379 5432; do
  if ss -ltn | awk '{print $4}' | grep -qE ":${port}$"; then
    echo "   process holding :${port} →"
    ss -ltnp | grep ":${port}" || true
    fail "port ${port} still busy — stop that process, then re-run this script"
  fi
done
ok "ports free"

# ── 3. Code ──────────────────────────────────────────────────────
if [ -f "$TARBALL" ]; then
  log "Extracting code → $APP_DIR"
  mkdir -p "$APP_DIR"
  tar xzf "$TARBALL" -C "$APP_DIR" --strip-components=0
elif [ -f "$APP_DIR/package.json" ]; then
  log "Code already present in $APP_DIR"
else
  fail "no code found — extract the repo to $APP_DIR first"
fi
ok "$(ls "$APP_DIR" | tr '\n' ' ')"

# ── 4. .env ──────────────────────────────────────────────────────
cd "$APP_DIR"
if [ ! -f .env ]; then
  log "Bootstrapping .env (fill Helius/Telegram/Treasury later)"
  cp .env.example .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^HELIUS_WEBHOOK_SECRET=.*|HELIUS_WEBHOOK_SECRET=$(openssl rand -hex 24)|" .env
  sed -i "s|^APP_URL=.*|APP_URL=http://${PUBLIC_IP}:3000|" .env
  ok ".env created — secrets generated"
else
  ok ".env already exists — keeping it"
fi

# ── 5. Services ──────────────────────────────────────────────────
log "Starting postgres + redis"
docker compose up -d postgres redis
for i in $(seq 1 30); do
  docker compose exec -T postgres pg_isready -U devradar -d devradar >/dev/null 2>&1 && break
  sleep 2
done
ok "infra healthy"

log "Building + starting web & worker (first build takes a few minutes)"
docker compose --profile prod up -d --build
ok "containers up"

log "Seeding known addresses"
for i in $(seq 1 30); do
  docker compose --profile prod exec -T worker pnpm --filter @devradar/db seed >/dev/null 2>&1 && { ok "seeded"; break; }
  sleep 4
  [ "$i" = 30 ] && echo "   (seed retry limit — run manually: docker compose --profile prod exec worker pnpm --filter @devradar/db seed)"
done

# ── 6. Smoke test ────────────────────────────────────────────────
log "Smoke test"
sleep 3
curl -fsS  http://localhost:8787/health >/dev/null && ok "worker  :8787 /health" || fail "worker not responding — docker compose --profile prod logs worker"
curl -fsS  http://localhost:3000/api/me >/dev/null && ok "web     :3000 /api/me" || fail "web not responding — docker compose --profile prod logs web"

# ── 7. Nginx: port 80 → DevRadar (old vhosts backed up) ─────────
if command -v nginx >/dev/null 2>&1; then
  log "Nginx"
  mkdir -p "$BACKUP_DIR/nginx-$STAMP"
  cp -r /etc/nginx/sites-enabled "$BACKUP_DIR/nginx-$STAMP/" 2>/dev/null || true
  rm -f /etc/nginx/sites-enabled/*
  sed 's/server_name devradar.example;/server_name _;/' "$APP_DIR/deploy/nginx/devradar.conf" \
    > /etc/nginx/sites-available/devradar.conf
  ln -sf /etc/nginx/sites-available/devradar.conf /etc/nginx/sites-enabled/devradar.conf
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true
    ok "port 80 → DevRadar (old configs in $BACKUP_DIR/nginx-$STAMP)"
  else
    echo "   nginx config test failed — app still reachable on :3000"
  fi
fi

cat <<EOF

════════════════════════════════════════════════════════════════
 DevRadar is LIVE
   Landing   →  http://${PUBLIC_IP}:3000
   Terminal  →  http://${PUBLIC_IP}:3000/app
   Backups   →  ${BACKUP_DIR}/

 Next steps
   1. nano ${APP_DIR}/.env   → fill HELIUS_API_KEY,
      TELEGRAM_BOT_TOKEN, TREASURY_WALLET … then:
      cd ${APP_DIR} && docker compose --profile prod up -d
   2. Helius webhook → http://${PUBLIC_IP}:8787/webhook/helius
      (Authorization header = HELIUS_WEBHOOK_SECRET from .env)
      — switch to https://<domain>/webhook/helius after nginx.
   3. Domain ready? → RUNBOOK.md step 5 (nginx + certbot,
      config in deploy/nginx/devradar.conf)
   4. Demo feed without Helius:
      cd ${APP_DIR} && docker compose --profile prod exec worker pnpm replay
════════════════════════════════════════════════════════════════
EOF
