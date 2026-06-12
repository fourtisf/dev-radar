# DevRadar worker — runs TypeScript directly via tsx (no build step;
# single Prisma client shared from packages/db).
# Build from the REPO ROOT: docker build -f apps/worker/Dockerfile .

FROM node:20-alpine
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json packages/db/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter @devradar/worker... --filter .

COPY tsconfig.base.json ./
COPY packages/db packages/db
COPY apps/worker apps/worker
RUN pnpm --filter @devradar/db generate

EXPOSE 8787
# Apply migrations, then boot ingest + queues + cron + bot + payments.
CMD ["sh", "-c", "pnpm --filter @devradar/db migrate && pnpm --filter @devradar/worker start"]
