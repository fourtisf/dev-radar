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
