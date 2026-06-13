import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  HELIUS_API_KEY: z.string().default(''),
  HELIUS_WEBHOOK_SECRET: z.string().default(''),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  // Optional broadcast channel for alerts. Leave blank to auto-capture
  // (post any message in the channel where the bot is admin).
  ALERT_CHANNEL_ID: z.string().default(''),
  TREASURY_WALLET: z.string().default(''),
  JWT_SECRET: z.string().default(''),
  APP_URL: z.string().default('http://localhost:3000'),
  WORKER_PORT: z.coerce.number().default(8787),
  NODE_ENV: z.string().default('development'),
  // 'live' = real pump.fun/DexScreener prices; 'stub' = demo walk for local replay.
  PRICE_MODE: z.enum(['live', 'stub']).default('live'),
  // Launch source: 'pumpportal' (free WebSocket, no Helius credits),
  // 'helius' (enhanced webhook), or 'both'.
  INGEST_SOURCE: z.enum(['pumpportal', 'helius', 'both']).default('pumpportal'),
  // 'lazy' (default) = analyse a dev only when its dossier is opened.
  // 'eager' = analyse every launch up front (higher Helius spend).
  BACKFILL_MODE: z.enum(['lazy', 'eager']).default('lazy'),
  // On-chain data source for the deep lookups (history/funding/bundle):
  // 'auto' = Helius if HELIUS_API_KEY set, else free public RPC.
  // 'rpc'  = always free public Solana RPC (no key). 'helius' = force Helius.
  CHAIN_SOURCE: z.enum(['auto', 'helius', 'rpc']).default('auto'),
  // Optional comma-separated Solana RPC endpoints (public RPC mode).
  SOLANA_RPC_URL: z.string().default(''),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
