# DevRadar — RUNBOOK

Operations guide for the Hostinger VPS deployment (Docker Compose:
postgres + redis + web + worker, behind Nginx + certbot).

---

## 1. First deploy (clean machine)

```bash
# 0) prerequisites: docker + compose plugin, nginx, certbot, git
apt update && apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx

# 1) clone + configure
git clone <repo> /opt/devradar && cd /opt/devradar
cp .env.example .env && nano .env          # see env checklist below

# 2) infra first
docker compose up -d postgres redis

# 3) build + start app services (runs prisma migrate on worker boot)
docker compose --profile prod up -d --build

# 4) seed known addresses (CEX/mixer/flagged labels)
docker compose --profile prod exec worker pnpm --filter @devradar/db seed

# 5) nginx + TLS
cp deploy/nginx/devradar.conf /etc/nginx/sites-available/devradar.conf
#   → replace server_name devradar.example with the real domain
ln -s /etc/nginx/sites-available/devradar.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d devradar.org -d www.devradar.org                # adds the 443 block + redirect

# 6) point the Helius webhook at https://<domain>/webhook/helius
#    with the Authorization header set to HELIUS_WEBHOOK_SECRET,
#    filtered to the pump.fun program (verify program ID first —
#    apps/worker/src/ingest/constants.ts).

# 7) smoke test
curl -s https://<domain>/api/me            # {"authenticated":false,"tier":"SCOUT"}
curl -s https://<domain>/                  # landing HTML
docker compose --profile prod logs worker --tail 20
```

Local dev without Helius: `pnpm replay` POSTs the recorded fixtures to
the worker and the whole pipeline runs on fakes (NullChainClient +
StubPriceProvider).

## 2. Env checklist (.env)

| Var | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | compose default `postgresql://devradar:devradar@postgres:5432/devradar` (services override host) |
| `REDIS_URL` | yes | compose default `redis://redis:6379` |
| `HELIUS_API_KEY` | prod | without it the worker runs replay-only (NullChainClient) |
| `HELIUS_WEBHOOK_SECRET` | yes | must match the Authorization header configured on the Helius webhook; webhook 401s without it |
| `TELEGRAM_BOT_TOKEN` | prod | BotFather token; bot disabled if empty |
| `TREASURY_WALLET` | prod | public address; payment watcher disabled if empty |
| `JWT_SECRET` | yes | `openssl rand -hex 32` |
| `APP_URL` | yes | public origin, used in Telegram deep links |
| `WORKER_PORT` | no | default 8787 |

## 3. Logs & where things live

- `docker compose --profile prod logs -f web` — Next.js (API + SSR).
- `docker compose --profile prod logs -f worker` — pino JSON: webhook
  latency (`webhook processed`), backfill durations (`backfill
  complete`), outcome ticks, payments, Telegram.
- Postgres data: `pgdata` volume · Redis AOF: `redisdata` volume.
- Queue state: `redis-cli keys 'bull:*'`; dead-lettered jobs sit in the
  `dead-letter` queue with the original payload + error.

## 4. Troubleshooting

### "Feed stopped" (no new rows in the terminal)

1. Worker receiving? `docker compose logs worker | grep "webhook processed" | tail`
   - Nothing → check the Helius dashboard (webhook paused? credits
     exhausted?) and that Nginx routes `/webhook/helius` to :8787.
2. Worker writing? `select max("createdAt") from "Token";`
3. NOTIFY → SSE path: `curl -N https://<domain>/api/feed/live` and
   replay a fixture; an event must appear. If DB inserts happen but no
   SSE: the web LISTEN connection died — it auto-reconnects with
   backoff; check web logs, then `docker compose restart web`.
4. Anonymous/Scout sessions are **delayed 5 minutes by design** —
   check with an Operator session before declaring an outage.

### "Webhook 401"

- `HELIUS_WEBHOOK_SECRET` in `.env` ≠ the Authorization header on the
  Helius webhook config. Fix one side, `docker compose restart worker`.
- The worker refuses ALL webhooks if the secret is unset (fail closed).

### Payments not upgrading tiers

- Watcher needs `TREASURY_WALLET` + `HELIUS_API_KEY` (check worker boot
  warnings).
- Memo must be exactly `DR-<userId>`; near-miss payments land in
  `PaymentUnmatched` for manual review:
  `select * from "PaymentUnmatched" order by "seenAt" desc;`
- Amount must be within ±2% of 2 SOL (Operator) or 8 SOL (Syndicate).

### Backfills slow / dead-lettered

- Duration is logged per backfill; typical wallets should land ≤10s.
- Exhausted jobs: inspect the `dead-letter` queue, fix the cause, then
  re-enqueue by re-tracing the wallet in the UI (jobs are idempotent).

## 5. Postgres backups

```bash
# /etc/cron.d/devradar-backup — daily 04:10, keep 14 days
10 4 * * * root docker compose -f /opt/devradar/docker-compose.yml exec -T postgres \
  pg_dump -U devradar devradar | gzip > /var/backups/devradar-$(date +\%F).sql.gz \
  && find /var/backups -name 'devradar-*.sql.gz' -mtime +14 -delete
```

Restore: `gunzip -c devradar-<date>.sql.gz | docker compose exec -T postgres psql -U devradar devradar`

## 6. Upgrades

```bash
cd /opt/devradar && git pull
docker compose --profile prod up -d --build   # worker re-runs prisma migrate on boot
```

## 7. Week-1 watchpoints (from the handoff)

- **Helius credit burn**: pump.fun does thousands of launches/day. If
  burn is high, narrow the webhook filter (creates only) before
  touching code.
- Verify the pump.fun program ID + create discriminator against 3 real
  transactions (`apps/worker/src/ingest/constants.ts` carries the
  warning) before trusting classifications.
- Engine thresholds are all in `apps/worker/src/engine/config.ts` —
  tune there, keep the reference-dossier tests green.
