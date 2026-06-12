# DevRadar

Deployer-intelligence platform for Solana memecoins (pump.fun MVP).
Every launch is attributed to its deployer wallet; the wallet's full
on-chain history — prior launches, outcomes, rug rate, bundle %,
snipers, funding origin — compiles into a dossier with an automatic
classification (Serial Winner / Serial Rugger / Fresh Wallet / Neutral)
and a 0–100 **DR Score**, in under ~2 seconds. Web terminal + Telegram
alerts; SOL-paid tiers (Scout free / Operator 2 SOL / Syndicate 8 SOL).

> Design source of truth: `reference/devradar-site.html` — port, never
> redesign. Full spec: `reference/devradar-handoff.md`.

## Layout

```
packages/db/        Prisma schema + client + seed (shared)
apps/web/           Next.js 14 — landing, terminal, API, SSE
apps/worker/        Node 20 TS — Helius ingest, engine, BullMQ jobs,
                    outcome cron, Telegram bot, SOL payment watcher
deploy/nginx/       VPS site config (SSE-friendly)
RUNBOOK.md          Ops: first deploy, env, troubleshooting, backups
apps/web/README-api.md   API contract + curl walkthrough
```

## Quickstart (local)

```bash
pnpm install
docker compose up -d postgres redis        # or any pg16 + redis 7
cp .env.example .env                       # set JWT_SECRET + HELIUS_WEBHOOK_SECRET at minimum

pnpm db:migrate && pnpm db:seed            # prisma migrate deploy + KnownAddress seed
pnpm dev:worker                            # ingest :8787 + queues + cron
pnpm dev:web                               # next dev :3000

pnpm replay                                # POST recorded pump.fun fixtures → feed lights up
```

Open http://localhost:3000 (landing) and /app (terminal). Without
`HELIUS_API_KEY` the worker runs in replay-only mode (NullChainClient +
stubbed prices) — the entire pipeline still exercises end-to-end.

## Tests & checks

```bash
pnpm test          # worker engine + consumers (vitest, no DB needed)
pnpm typecheck     # strict TS across all packages
```

Engine weights/thresholds live in `apps/worker/src/engine/config.ts`;
the reference dossiers from the prototype pin the scoring bands
(winner 82–96 · rugger 4–16 · fresh 35–60) in `score.test.ts`.

## Production

See `RUNBOOK.md`. Short version: `docker compose --profile prod up -d
--build` on the VPS, nginx site from `deploy/nginx/`, certbot, point
the Helius webhook at `/webhook/helius` with the shared secret.

## Phase 2 (do not build yet)

Ghost Match similarity engine · LaunchLab/Moonshot/Meteora venues ·
public API tier · portfolio Rug Shield. Stub: `engine/ghost.ts`.
