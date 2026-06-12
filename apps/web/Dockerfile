# DevRadar web — multi-stage build (Next.js standalone output).
# Build from the REPO ROOT: docker build -f apps/web/Dockerfile .

FROM node:20-alpine AS deps
# npm-installed pnpm (corepack in this base image fails signature
# checks on newer pnpm); openssl/libc6-compat for prisma engines.
RUN apk add --no-cache openssl libc6-compat && npm i -g pnpm@10.33.0
WORKDIR /app
# pnpm needs every workspace manifest present for a frozen-lockfile
# install, even when filtering.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json packages/db/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter @devradar/web... --filter .

FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY packages/db packages/db
COPY apps/web apps/web
# Prisma client must exist before next build (DATABASE_URL not needed to generate)
RUN pnpm --filter @devradar/db generate && pnpm --filter @devradar/web build

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
