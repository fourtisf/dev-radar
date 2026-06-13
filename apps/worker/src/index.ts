import { Worker } from 'bullmq';
import { prisma } from '@devradar/db';
import { env } from './env';
import { buildIngestServer, handleLaunchEvent } from './ingest/server';
import { startPumpPortal } from './ingest/pumpportal';
import { createRedis } from './lib/redis';
import {
  deadLetterQueue,
  QUEUE,
  type AlertJob,
  type BackfillDevJob,
  type LaunchAnalysisJob,
  type TraceResolveJob,
} from './lib/queues';
import { HeliusClient } from './chain/helius';
import { NullChainClient } from './chain/null';
import { PublicRpcChainClient } from './chain/rpc';
import { LivePriceProvider, StubPriceProvider } from './chain/price';
import type { ChainClient } from './chain/types';

/** Pick the on-chain data source (handles CHAIN_SOURCE + key presence). */
function selectChain(): { chain: ChainClient; enabled: boolean; label: string } {
  if (env.CHAIN_SOURCE === 'rpc') return { chain: new PublicRpcChainClient(), enabled: true, label: 'public-rpc' };
  if (env.CHAIN_SOURCE === 'helius') {
    return env.HELIUS_API_KEY
      ? { chain: new HeliusClient(), enabled: true, label: 'helius' }
      : { chain: new NullChainClient(), enabled: false, label: 'null (no helius key)' };
  }
  // auto
  return env.HELIUS_API_KEY
    ? { chain: new HeliusClient(), enabled: true, label: 'helius' }
    : { chain: new PublicRpcChainClient(), enabled: true, label: 'public-rpc' };
}
import { analyzeLaunch } from './jobs/launchAnalysis';
import { backfillDev } from './jobs/backfillDev';
import { prismaBackfillDb } from './jobs/backfillPrisma';
import { refreshDev } from './jobs/refreshDev';
import { resolveTrace } from './jobs/traceResolve';
import { runOutcomeTick, StubClusterSignalProvider } from './cron/outcomes';
import { createBot } from './alerts/bot';
import { dispatchAlert } from './alerts/dispatch';
import { pollPayments } from './payments/watcher';
import { ENGINE } from './engine/config';

async function main(): Promise<void> {
  const app = buildIngestServer();
  const log = app.log;

  const { chain, enabled: chainEnabled, label: chainLabel } = selectChain();
  log.info({ source: chainLabel, enabled: chainEnabled }, 'chain client');
  const price = env.PRICE_MODE === 'stub' ? new StubPriceProvider() : new LivePriceProvider();
  log.info({ mode: env.PRICE_MODE }, 'price provider');
  const signals = new StubClusterSignalProvider();
  const bot = createBot();

  // ── BullMQ consumers ──────────────────────────────────────────
  const connection = createRedis();

  // In lazy mode per-launch analysis is skipped, so run bundle + sniper
  // + funding once for the dev's latest token when its dossier is first
  // opened. Deduped in Redis (6h) so repeated views cost nothing.
  const ensureAnalysis = async (wallet: string): Promise<void> => {
    if (env.BACKFILL_MODE !== 'lazy' || !chainEnabled) return;
    const token = await prisma.token.findFirst({
      where: { devWallet: wallet },
      orderBy: { createdAt: 'desc' },
    });
    if (!token) return;
    const dedupeKey = `analyzed:${token.mint}`;
    if (await connection.set(dedupeKey, '1', 'EX', 21_600, 'NX') !== 'OK') return;
    try {
      await analyzeLaunch({ mint: token.mint, deployer: wallet, slot: 0 }, chain);
    } catch (err) {
      log.warn({ err: String(err), wallet }, 'on-demand analysis failed');
    }
  };

  const backfillWorker = new Worker<BackfillDevJob>(
    QUEUE.backfillDev,
    async (job) => {
      const result = await backfillDev(job.data.wallet, {
        chain,
        price,
        db: prismaBackfillDb,
        log: (msg, fields) => log.info(fields ?? {}, msg),
      });
      if (!result.skipped) {
        await refreshDev(job.data.wallet);
        await ensureAnalysis(job.data.wallet);
      }
      return result;
    },
    { connection, concurrency: ENGINE.backfill.concurrency },
  );

  const analysisWorker = new Worker<LaunchAnalysisJob>(
    QUEUE.launchAnalysis,
    async (job) => analyzeLaunch(job.data, chain),
    { connection, concurrency: 4 },
  );

  const alertsWorker = new Worker<AlertJob>(
    QUEUE.alerts,
    async (job) => dispatchAlert(job.data, bot),
    { connection, concurrency: 4 },
  );

  const traceWorker = new Worker<TraceResolveJob>(
    QUEUE.traceResolve,
    async (job) => resolveTrace(job.data, chain),
    { connection, concurrency: 2 },
  );

  // Dead-letter: park exhausted jobs for inspection (RUNBOOK covers requeueing).
  for (const w of [backfillWorker, analysisWorker, traceWorker]) {
    w.on('failed', (job, err) => {
      log.error({ queue: w.name, jobId: job?.id, err: err.message }, 'job failed');
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        void deadLetterQueue.add(w.name, { data: job.data, error: err.message });
      }
    });
  }

  // ── Outcome cron: every 10 minutes, overlap-guarded ───────────
  let cronRunning = false;
  const tick = async (): Promise<void> => {
    if (cronRunning) return;
    cronRunning = true;
    try {
      const res = await runOutcomeTick(price, signals);
      log.info(res, 'outcome tick');
    } catch (err) {
      log.error({ err }, 'outcome tick failed');
    } finally {
      cronRunning = false;
    }
  };
  const cronTimer = setInterval(tick, ENGINE.snapshots.fastEveryMin * 60_000);
  setTimeout(tick, 15_000);

  // ── Payment watcher: every 60 seconds ─────────────────────────
  let payTimer: NodeJS.Timeout | null = null;
  if (env.TREASURY_WALLET && chainEnabled) {
    let payRunning = false;
    payTimer = setInterval(async () => {
      if (payRunning) return;
      payRunning = true;
      try {
        await pollPayments(chain, env.TREASURY_WALLET, (msg, fields) =>
          log.info(fields ?? {}, msg),
        );
      } catch (err) {
        log.error({ err }, 'payment poll failed');
      } finally {
        payRunning = false;
      }
    }, 60_000);
  } else {
    log.warn('payment watcher disabled (TREASURY_WALLET missing or chain source disabled)');
  }

  // ── Telegram bot (long polling) ───────────────────────────────
  if (bot) {
    bot.catch((err) => log.error({ err: err.message }, 'telegram bot error'));
    // Explicitly subscribe to channel_post so the broadcast-channel
    // auto-capture works (it's not always in the polling default).
    void bot.start({
      allowed_updates: ['message', 'callback_query', 'channel_post', 'my_chat_member'],
      onStart: (me) => log.info({ username: me.username }, 'telegram bot up'),
    });
  } else {
    log.warn('telegram bot disabled (TELEGRAM_BOT_TOKEN missing)');
  }

  // ── Launch ingestion: PumpPortal WS (free) and/or Helius webhook ─
  let stopPumpPortal: (() => void) | null = null;
  if (env.INGEST_SOURCE === 'pumpportal' || env.INGEST_SOURCE === 'both') {
    stopPumpPortal = startPumpPortal({
      onLaunch: handleLaunchEvent,
      log: {
        info: (o, m) => log.info(o, m),
        warn: (o, m) => log.warn(o, m),
        error: (o, m) => log.error(o, m),
      },
    });
  }
  log.info(
    { source: env.INGEST_SOURCE, backfill: env.BACKFILL_MODE },
    'ingestion configured',
  );

  await app.listen({ port: env.WORKER_PORT, host: '0.0.0.0' });
  log.info({ port: env.WORKER_PORT }, 'devradar worker up');

  // ── Graceful shutdown ─────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    clearInterval(cronTimer);
    if (payTimer) clearInterval(payTimer);
    if (stopPumpPortal) stopPumpPortal();
    if (bot) await bot.stop();
    await Promise.allSettled([
      backfillWorker.close(),
      analysisWorker.close(),
      alertsWorker.close(),
      traceWorker.close(),
      app.close(),
    ]);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('worker boot failed', err);
  process.exit(1);
});
