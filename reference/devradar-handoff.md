# DEVRADAR — CLAUDE CODE HANDOFF PACKAGE
**From:** ALFA · **To:** Michael · **Date:** June 2026 · **Version:** 1.0

---

## 0. WHAT'S IN THIS PACKAGE

You receive two files:

1. `devradar-site.html` — the approved interactive prototype. This is the **design source of truth**. Landing page + terminal app in one file, with the full design system (colors, fonts, spacing, motion). Claude Code must port this 1:1 visually — do not redesign.
2. `devradar-handoff.md` — this document. Architecture, schema, algorithms, API contract, and the Claude Code prompt sequence in Section 13. Paste prompts in order.

Read Sections 1–12 once before starting. Then execute Section 13 prompt by prompt.

---

## 1. PROJECT SUMMARY

**DevRadar** is a deployer-intelligence platform for Solana memecoins. Every new token launch is attributed to its deployer wallet; the deployer's full on-chain history (prior launches, outcomes, rug rate, funding origin) is compiled into a dossier with an automatic classification (Serial Winner / Serial Rugger / Fresh Wallet / Neutral) and a 0–100 **DR Score** — delivered in under ~2 seconds via web terminal and Telegram alerts.

Revenue: SOL subscriptions (Scout free / Operator 2 SOL/mo / Syndicate 8 SOL/mo). Part of the Fourtis ecosystem.

**MVP scope (this handoff):** pump.fun ingestion, dossier + classification + DR Score, live terminal, Telegram alerts, SOL payment gating.
**Explicitly Phase 2 (do not build now):** Ghost Match similarity engine, Raydium LaunchLab / Moonshot / Meteora venues, public API tier, portfolio Rug Shield.

---

## 2. DEFINITION OF DONE (MVP)

1. New pump.fun launches appear in the terminal feed within ≤ 3s of on-chain creation.
2. Clicking a feed row opens a dossier with: classification, DR Score, launch history, bundle %, sniper level, funding origin, confidence.
3. `/trace <mint or wallet>` resolves any token to its deployer dossier (backfilling history on first sight, ≤ 10s cold, ≤ 2s warm).
4. Telegram bot delivers winner-only alerts ≤ 3s after deploy for Operator users.
5. Paying 2 SOL to the treasury wallet (with memo) upgrades the account to Operator within ≤ 60s, no manual step.
6. Landing page is pixel-faithful to the prototype; terminal is wired to real data.
7. Outcome tracker reclassifies tokens (LIVE → CLEAN / RUG / DEAD) on schedule without manual input.

---

## 3. STACK & REPO LAYOUT

- **Web:** Next.js 14 (App Router, TypeScript) + Tailwind. Fonts: Clash Display + Switzer (Fontshare), Geist Mono (Google).
- **Worker:** Node.js 20 + TypeScript standalone service (ingestion, backfill, outcome cron, alert dispatch). Runs separately from Next so webhook bursts never block the web app.
- **DB:** PostgreSQL 16 (self-hosted on the VPS via Docker). **Prisma** ORM, schema shared by web + worker.
- **Queue/cache:** Redis (BullMQ) for backfill jobs + alert fanout. Light footprint; same VPS.
- **Realtime:** SSE from web app (`/api/feed/live`), backed by Postgres LISTEN/NOTIFY (worker NOTIFYs on insert). No third-party websocket infra.
- **Chain data:** Helius — webhooks for launch events, RPC + Enhanced Transactions API for backfill. (We already run Helius for HWAIAGENT; same account, new webhook.)
- **Telegram:** grammY.
- **Auth:** Sign-In With Solana (nonce + signMessage). No email/password.
- **Deploy:** Docker Compose on the Hostinger VPS (postgres, redis, web, worker) behind Nginx + certbot.

```
devradar/
├── CLAUDE.md                 # context file for Claude Code (Section 12)
├── docker-compose.yml
├── packages/db/              # prisma schema + generated client (shared)
├── apps/web/                 # Next.js — landing + terminal + API routes
└── apps/worker/              # ingestion, backfill, outcomes, alerts
    ├── src/ingest/           # webhook consumer
    ├── src/backfill/         # dev history builder
    ├── src/engine/           # classify.ts, score.ts, outcomes.ts, bundle.ts, snipers.ts, funding.ts
    ├── src/alerts/           # telegram dispatch
    └── src/payments/         # SOL payment watcher
```

---

## 4. SYSTEM ARCHITECTURE

```
            ┌──────────────────────────────── Helius ───────────────────────────────┐
            │  Webhook: pump.fun program txs        RPC / Enhanced Tx API (backfill) │
            └───────────────┬───────────────────────────────────────┬───────────────┘
                            ▼                                       ▼
                   POST /webhook/helius                    BullMQ backfill jobs
                   (worker, HMAC-verified)                 (dev history, outcomes)
                            │                                       │
                            ▼                                       ▼
                 ┌───────── ENGINE (worker) ─────────────────────────────┐
                 │ parse launch → upsert dev/token → bundle + sniper     │
                 │ → funding trace → classify → DR Score → NOTIFY        │
                 └───────┬───────────────────────────────┬──────────────┘
                         ▼                               ▼
                  Postgres (truth)                Telegram alerts (grammY)
                         │
              LISTEN/NOTIFY → SSE /api/feed/live
                         ▼
        Next.js web: landing (static) + terminal (live) + REST API
                         ▲
        SIWS auth · tier gating · SOL payment watcher (worker)
```

---

## 5. DATA SOURCE NOTES (READ BEFORE PROMPT 2)

- pump.fun program ID: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`. **Verify against current Helius docs before wiring** — and confirm the create-instruction discriminator with one sample tx.
- Create a Helius **enhanced webhook** filtered to that program. Parse only token-create instructions; ignore swaps at the webhook level if Helius filtering allows, otherwise discard in the consumer fast-path.
- **Volume warning:** pump.fun does thousands of launches/day. The webhook consumer must be O(1): verify HMAC → parse → upsert → enqueue → return 200. All heavy work (backfill, funding trace) goes through BullMQ.
- Deployer = the create-instruction signer/creator. Confirm field mapping with 3 sample transactions before trusting it.
- Backfill per dev: Enhanced Transactions API, walk wallet history, collect prior pump.fun creates → token list → fetch each token's peak/outcome data. Cache aggressively (`devs.backfilled_at`); re-backfill only if older than 24h.
- Watch Helius credit usage in week 1; if burn is high, narrow webhook filters before optimizing code.

---

## 6. DATABASE SCHEMA (PRISMA)

```prisma
enum Verdict   { WINNER RUGGER FRESH NEUTRAL }
enum Outcome   { LIVE CLEAN RUG DEAD }
enum Tier      { SCOUT OPERATOR SYNDICATE }
enum FundType  { CEX_CLEAN UNVERIFIED MIXER LINKED_FLAGGED }
enum SnipeLvl  { LOW MED HIGH }

model Dev {
  wallet           String   @id
  firstSeenAt      DateTime
  verdict          Verdict  @default(FRESH)
  confidence       Int      @default(50)        // 0–100
  launchCount      Int      @default(0)
  rugCount         Int      @default(0)
  cleanCount       Int      @default(0)
  bestAthUsd       Decimal  @default(0)
  medianLifespanS  Int      @default(0)
  fundingType      FundType @default(UNVERIFIED)
  fundingPath      Json?                         // [{wallet,label,hop,sol,ts}]
  flagged          Boolean  @default(false)      // confirmed rugger cluster
  backfilledAt     DateTime?
  updatedAt        DateTime @updatedAt
  tokens           Token[]
}

model Token {
  mint        String   @id
  devWallet   String
  dev         Dev      @relation(fields: [devWallet], references: [wallet])
  name        String
  symbol      String
  venue       String   @default("pumpfun")
  createdAt   DateTime
  bundlePct   Decimal  @default(0)
  sniperLvl   SnipeLvl @default(LOW)
  drScore     Int      @default(50)
  outcome     Outcome  @default(LIVE)
  peakMcapUsd Decimal  @default(0)
  lifespanS   Int      @default(0)
  @@index([createdAt(sort: Desc)])
  @@index([devWallet])
}

model TokenSnapshot {
  id      BigInt   @id @default(autoincrement())
  mint    String
  ts      DateTime @default(now())
  mcapUsd Decimal
  liqUsd  Decimal
  @@index([mint, ts])
}

model KnownAddress {
  address String @id
  label   String            // "Binance 8", "FixedFloat", ...
  type    String            // cex | mixer | flagged
}

model User {
  id          String    @id @default(cuid())
  wallet      String    @unique
  tier        Tier      @default(SCOUT)
  tierExpires DateTime?
  tgChatId    String?   @unique
  tgLinkCode  String?   @unique
  alertPrefs  Json      @default("{\"winnerOnly\":true}")
  createdAt   DateTime  @default(now())
  watchlist   Watch[]
}

model Watch {
  userId    String
  devWallet String
  user      User   @relation(fields: [userId], references: [id])
  @@id([userId, devWallet])
}

model Payment {
  signature  String   @id
  wallet     String
  amountSol  Decimal
  tier       Tier
  verifiedAt DateTime @default(now())
}
```

Seed `KnownAddress` with the top ~50 CEX hot wallets (Binance, Coinbase, OKX, Bybit, Kraken — pull current lists from a public labels dataset) plus known instant-swap services. Keep it a maintained CSV in the repo.

---

## 7. CORE ALGORITHMS (worker `src/engine/` — pure functions + unit tests)

### 7.1 Outcome rules (`outcomes.ts`, cron every 10 min over LIVE tokens)
- **RUG** if: dev cluster removes >80% LP, OR dev cluster sells >70% of supply within 24h of launch, OR price drops ≥97% from peak within 1h alongside dev-cluster sells.
- **CLEAN** if: peak mcap ≥ $100k AND age ≥ 72h AND no rug trigger.
- **DEAD** if: age ≥ 72h AND mcap < $10k AND no rug trigger.
- else **LIVE**. Snapshot cadence: every 10 min for age < 24h, hourly until 72h, then stop.

### 7.2 Classification (`classify.ts`)
```
walletAgeDays = now - dev.firstSeenAt
rugRate = rugCount / max(launchCount, 1)

WINNER  if launchCount ≥ 5 AND rugRate ≤ 0.10 AND bestAthUsd ≥ 250_000
RUGGER  if (launchCount ≥ 5 AND rugRate ≥ 0.60)
        OR (fundingType == LINKED_FLAGGED AND launchCount ≥ 2)
FRESH   if launchCount ≤ 2 AND walletAgeDays < 7
NEUTRAL otherwise
```
Confidence: starts at 60, +4 per resolved launch (cap 99), −15 if backfill incomplete, floor 40 for FRESH. All thresholds in `engine/config.ts` — they will be tuned.

### 7.3 DR Score (`score.ts`, clamp 0–100)
```
score = 50
score += min(35, cleanCount*6 + log10(max(bestAthUsd,1))*3)   // track record up
score -= min(40, rugRate * 45 * min(launchCount/5, 1))        // rug history down
score -= min(20, max(0, bundlePct - 8) * 1.2)                 // bundle penalty
score -= {LOW:0, MED:8, HIGH:16}[sniperLvl]
score += {CEX_CLEAN:+6, UNVERIFIED:-4, MIXER:-15, LINKED_FLAGGED:-25}[fundingType]
if launchCount ≤ 2: score = clamp(score, 30, 60)              // fresh uncertainty band
```
UI bands: ≥70 green · 40–69 gold · <40 red. Weights live in `config.ts`; write unit tests against the three reference dossiers used in the prototype (winner ≈ 82–96, rugger ≈ 4–16, fresh ≈ 35–60).

### 7.4 Bundle detection (`bundle.ts`)
At launch, take buyers in the first 2 slots. Cluster wallets sharing a funding parent within 2 hops or funded by the deployer. `bundlePct` = clustered share of supply bought. Flag ≥18% as hot (matches UI).

### 7.5 Sniper level (`snipers.ts`)
First-2-slot buyer count, excluding the dev cluster: <5 LOW · 5–14 MED · ≥15 HIGH.

### 7.6 Funding trace (`funding.ts`)
BFS backwards on incoming SOL transfers from the deployer wallet, max 3 hops, max 25 wallets. First match wins: KnownAddress cex → `CEX_CLEAN`; mixer/instant-swap → `MIXER`; any wallet in a `flagged=true` dev's cluster → `LINKED_FLAGGED`; nothing in 3 hops → `UNVERIFIED`. Persist the path to `fundingPath` for dossier display.

### 7.7 Ghost Match — **Phase 2 stub only.** Create `ghost.ts` exporting `ghostMatch(): null` with a TODO block describing the planned fingerprint (funding lineage + deploy-timing + bundle-style + naming patterns). Do not implement.

---

## 8. API CONTRACT (Next.js route handlers)

```
GET  /api/feed?cursor=&filter=all|win|rug|fresh     → recent deploys (50/page)
GET  /api/feed/live                                 → SSE: {type:"deploy", token, dev}
GET  /api/dev/:wallet                               → full dossier (404 → enqueue backfill, 202)
GET  /api/token/:mint                               → token + dossier
POST /api/trace        {q}                          → resolve mint|wallet → dossier (202 while cold backfill)
GET  /api/leaderboard?type=winners|ruggers          → top 20 by DR score
POST /api/auth/nonce   {wallet}                     → nonce
POST /api/auth/verify  {wallet, signature}          → httpOnly session JWT
GET/POST/DELETE /api/watchlist                      → auth required
POST /api/telegram/link                             → returns one-time code for /start
GET  /api/me                                        → tier, expiry, prefs
```
Tier gating middleware: SCOUT → 10 dossier requests/day (Redis counter) + feed rows delayed 5 min; OPERATOR/SYNDICATE → unlimited + realtime. Rate-limit everything per-IP regardless.

---

## 9. FRONTEND PORT NOTES

- Open `devradar-site.html`, extract the `:root` tokens into `tailwind.config` (colors, fonts, radius) and globals. **Do not invent new colors or fonts.**
- Landing (`/`): static port of the landing view, except the terminal-section preview frame which consumes the real SSE feed (last 8 rows). Hero dossier keeps the 3-profile cycling with the scan-sweep transition, using three real flagship dossiers fetched at build/ISR time.
- Terminal (`/app`): port the terminal view; replace the simulated engine with `/api/feed` + SSE; dossier panel → `/api/dev/:wallet`; watchlist/leaderboard → API. Keep every interaction from the prototype: filters, pause (client-side buffer), `/` focus, Esc to exit, copy CA, scan-sweep on dossier swap, winner toasts, optional sound.
- Auth gate: terminal browsable logged-out with SCOUT limits; wallet connect (SIWS) to unlock tier features.
- Respect `prefers-reduced-motion` exactly as the prototype does.

---

## 10. TELEGRAM BOT (grammY, runs in worker)

- `/start <code>` → links chat to user (code from `/api/telegram/link`).
- `/settings` → inline keyboard: Winner-only ON/OFF · min DR Score (50/70/85) · watchlist-only mode.
- Alert templates = the prototype's TG mockup, verbatim formatting:
  - **Winner deploy** (Operator+): `● PROVEN DEPLOYER LIVE` + token, dev short, launches/rugs/best ATH, bundle, snipers, DR Score, links (dossier deep-link, chart placeholder).
  - **Watchlist deploy:** any tier with that dev followed.
  - **Rug-link flag:** Operator+, when a token they traced this week gets `LINKED_FLAGGED`.
- Dispatch through BullMQ with per-chat throttling (max 1 msg/sec/chat) to respect TG limits.

---

## 11. PAYMENTS & TIERS (SOL, no third party)

- Treasury wallet: env `TREASURY_WALLET` (ALFA provides).
- Flow: web shows "Send exactly 2.000 SOL with memo `DR-<userId>`" (Solana Pay QR + copy button). Worker payment watcher polls treasury txs every 20s, matches memo → upsert Payment → set tier 30 days (extend if active). 8 SOL → SYNDICATE.
- Edge cases: wrong amount within ±2% → accept and log; no memo → hold in `payments_unmatched` table for manual review; duplicate signature → ignore.

---

## 12. `CLAUDE.md` (place at repo root before Prompt 1)

```md
# DevRadar — context for Claude Code
Deployer-intelligence platform for Solana memecoins (pump.fun MVP).
Monorepo: packages/db (Prisma, shared), apps/web (Next.js 14 + Tailwind),
apps/worker (Node 20 TS: Helius ingest, BullMQ jobs, engine, Telegram, payments).
Postgres 16 + Redis via docker-compose. Realtime = Postgres NOTIFY → SSE.

Rules:
- Design source of truth is devradar-site.html in /reference. Port, never redesign.
- All engine thresholds live in apps/worker/src/engine/config.ts.
- Engine functions are pure + unit-tested (vitest). Webhook fast-path is O(1);
  heavy work goes to BullMQ.
- Never log private keys. All secrets via .env (see .env.example).
- TypeScript strict everywhere. No `any` in engine code.
```

---

## 13. CLAUDE CODE PROMPT SEQUENCE

> Michael: create the repo, drop in `CLAUDE.md` (Section 12) and `reference/devradar-site.html`, then paste these prompts **in order**. Finish + verify each acceptance check before the next. If Claude Code asks a question answered by this doc, paste the relevant section.

---

**PROMPT 1 — Scaffold + DB**
```
Scaffold the DevRadar monorepo per CLAUDE.md: pnpm workspaces with packages/db,
apps/web (Next.js 14 App Router + TS + Tailwind), apps/worker (Node 20 TS, tsx dev).
Add docker-compose.yml with postgres:16 and redis:7 (volumes, healthchecks).
In packages/db create the full Prisma schema below, generate client, and add a seed
script that loads prisma/seed/known_addresses.csv into KnownAddress (create the CSV
with 10 placeholder rows: 5 cex, 3 mixer, 2 flagged).
[paste Section 6 schema]
Add .env.example covering: DATABASE_URL, REDIS_URL, HELIUS_API_KEY,
HELIUS_WEBHOOK_SECRET, TELEGRAM_BOT_TOKEN, TREASURY_WALLET, JWT_SECRET, APP_URL.
Acceptance: docker compose up -d; pnpm db:migrate && pnpm db:seed succeed;
both apps boot with placeholder entrypoints.
```

**PROMPT 2 — Helius ingest fast-path**
```
In apps/worker build the ingestion service:
- Fastify server, POST /webhook/helius. Verify Helius auth header against
  HELIUS_WEBHOOK_SECRET; reject otherwise.
- Parse pump.fun token-create events (program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P —
  add a constants file noting this must be re-verified against Helius docs).
  Extract: mint, name, symbol, deployer wallet, slot, timestamp.
- Fast-path only: upsert Dev (firstSeenAt if new) + insert Token (outcome LIVE,
  drScore 50), enqueue BullMQ jobs `backfill-dev` and `launch-analysis`,
  pg NOTIFY 'deploys' with the token payload, return 200. Target <50ms excluding IO waits.
- Add scripts/replay.ts that POSTs 3 recorded sample payloads from fixtures/ for local dev,
  and write fixtures from realistic fake data for now.
Acceptance: replay script inserts 3 tokens + devs, NOTIFY fires (log listener), unit
tests for the parser pass on the fixtures.
```

**PROMPT 3 — Engine: outcomes, classify, score (pure + tested)**
```
Implement apps/worker/src/engine/{config,outcomes,classify,score}.ts exactly per the
spec below, as pure functions with vitest unit tests. Reference dossiers must score:
winner-profile 82–96, rugger-profile 4–16, fresh-profile 35–60 (encode these three
profiles as test fixtures matching the prototype's hero dossiers).
Add the outcome cron in worker: every 10 min, snapshot LIVE tokens (mcap/liq via a
PriceProvider interface with a stub implementation for now), apply outcome rules,
update Dev aggregates (launchCount, rugCount, cleanCount, bestAthUsd,
medianLifespanS), re-run classify + score, persist.
[paste Sections 7.1, 7.2, 7.3]
Acceptance: pnpm test green; running the cron against seeded fixtures flips a
token LIVE→RUG and the dev WINNER→NEUTRAL correctly.
```

**PROMPT 4 — Launch analysis: bundle, snipers, funding**
```
Implement the `launch-analysis` BullMQ consumer using engine/{bundle,snipers,funding}.ts
per the spec below. Chain access through a HeliusClient wrapper (rate-limited,
retries with backoff, all calls behind an interface so tests can mock).
Funding trace: BFS incoming SOL transfers, max 3 hops / 25 wallets, classify against
KnownAddress + flagged dev clusters, persist fundingType + fundingPath.
After analysis, recompute DR Score and NOTIFY 'dossier-update'.
Create engine/ghost.ts as the Phase-2 stub described in the spec.
[paste Sections 7.4, 7.5, 7.6, 7.7]
Acceptance: unit tests with mocked HeliusClient cover: clean CEX path, mixer path,
flagged-link path, 3-hop dead end; bundlePct math verified on a fixture of 12 buys.
```

**PROMPT 5 — Backfill worker**
```
Implement the `backfill-dev` BullMQ consumer: walk the dev wallet's history via
HeliusClient (Enhanced Transactions), collect all prior pump.fun creates, upsert
historical Tokens with best-effort peak mcap via PriceProvider, set outcomes via
the same rules where data allows (else DEAD if older than 72h and worthless),
update Dev aggregates + classify + score, set backfilledAt.
Skip if backfilledAt < 24h old. Concurrency 3, exponential backoff, dead-letter queue.
GET /api/dev/:wallet (built later) relies on this returning within ~10s for typical
wallets — add a duration log and a test with a mocked 40-tx history.
Acceptance: mocked-history test produces correct aggregates; re-running within 24h is a no-op.
```

**PROMPT 6 — Web API + SSE + auth + gating**
```
In apps/web implement all route handlers from the contract below.
- SSE /api/feed/live: subscribe to pg NOTIFY 'deploys' and 'dossier-update', stream
  JSON events, heartbeat every 25s, clean disconnect handling.
- SIWS auth: nonce in Redis (5 min TTL), verify ed25519 signature, httpOnly JWT cookie.
- Tier middleware: SCOUT = 10 dossiers/day (Redis counter keyed wallet||ip) and
  feed rows older than 5 min only; OPERATOR/SYNDICATE = realtime + unlimited.
  Global per-IP rate limit on everything.
[paste Section 8]
Acceptance: curl walkthrough in a README-api.md proves each endpoint; SSE shows a
deploy end-to-end when replay script fires; SCOUT limits enforced.
```

**PROMPT 7 — Landing page port**
```
Port the landing view from reference/devradar-site.html into apps/web route "/".
Extract :root tokens into Tailwind config + globals (champagne gold scale, hairlines,
Clash Display/Switzer/Geist Mono via next/font where possible, fontshare link otherwise).
Keep 1:1: nav glass-on-scroll, hero with cycling dossier (fetch 3 flagship dossiers
from /api/dev/:wallet with ISR, fallback to the prototype's static profiles),
ticker, coverage strip, problem, bento capabilities, terminal preview section
(consume real SSE, last 8 rows), protocol, alerts, pricing, final CTA, footer watermark.
All "Launch App" CTAs route to /app. prefers-reduced-motion respected exactly as the
prototype. Lighthouse perf ≥ 85 desktop.
Acceptance: visual diff against the prototype is negligible; preview frame shows live
rows from the replay script.
```

**PROMPT 8 — Terminal port (wired)**
```
Port the terminal view into route "/app" wired to real data:
- Feed from GET /api/feed + SSE appends; filters all/win/fresh/rug; pause buffers
  client-side; row click → dossier panel via /api/dev/:wallet with the scan-sweep
  transition; 202 (cold backfill) shows the "Re-tracing…" state and polls.
- Tracebar → POST /api/trace ("/" focuses, Enter submits). Esc returns to "/".
- Tabs: Dossier / Watchlist (API-backed for logged-in users) / Top Devs
  (/api/leaderboard). Copy CA, winner toasts, optional sound — all as prototype.
- Wallet connect button (SIWS) in topbar; tier badge reflects /api/me; logged-out
  users see SCOUT badge + delayed feed notice.
Acceptance: full demo flow works against replay data: live row in → click → dossier
→ follow → watchlist → leaderboard → trace cold wallet → 202 → resolved.
```

**PROMPT 9 — Telegram bot + alert dispatch**
```
Implement the grammY bot in apps/worker per the spec below: /start linking with
one-time code, /settings inline keyboard (winner-only, min DR Score 50/70/85,
watchlist-only), alert consumers on BullMQ reading deploy events and fanning out to
eligible users (tier + prefs + watchlist), per-chat 1 msg/sec throttle, exact message
formatting from the prototype's TG mockup including the DR Score line.
[paste Section 10]
Acceptance: with two fake users (Operator winner-only, Scout watchlist-only), the
replay script triggers exactly the right messages to a test chat.
```

**PROMPT 10 — Payments + deploy**
```
1) Payment watcher in worker per the spec below: poll treasury txs every 20s via
HeliusClient, match memo DR-<userId>, ±2% amount tolerance, upsert Payment,
extend tier 30 days, handle unmatched + duplicates. Web /pricing buttons open a
pay modal (amount, memo, Solana Pay QR, copy buttons) and poll /api/me for upgrade.
[paste Section 11]
2) Production deploy: multi-stage Dockerfiles for web + worker, extend
docker-compose with both services + restart policies, Nginx site config
(devradar domain TBD) with SSE-friendly proxy settings (no buffering), certbot
notes, and a RUNBOOK.md: first-deploy steps, env checklist, log locations,
"feed stopped" and "webhook 401" troubleshooting, backup cron for Postgres.
Acceptance: docker compose up on a clean machine + RUNBOOK gets to a working
instance; a testnet-style fake payment row flips a user to OPERATOR.
```

---

## 14. WHAT ALFA PROVIDES (before Prompt 2)

1. Helius API key + webhook secret (reuse account, create new webhook).
2. Telegram bot token from BotFather (suggest `@DevRadarBot` or nearest available).
3. Treasury wallet public address (fresh wallet, hardware-backed).
4. Domain decision + DNS pointed to the VPS (devradar.io / .app / .fun — ALFA to check availability).
5. Go/no-go on final pricing (2 / 8 SOL are placeholders).

## 15. PHASE 2 BACKLOG (do not build now)

Ghost Match similarity engine · Raydium LaunchLab + Moonshot + Meteora venues · public API + webhooks (Syndicate) · portfolio Rug Shield scan · execution deep-links (Axiom/Photon/Trojan) · dev profile share cards (leaderboard virality) · mobile PWA polish.

---

*End of handoff. Questions → ALFA on Telegram.*
