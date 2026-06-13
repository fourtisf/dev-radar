import { Worker } from 'bullmq';
import { env } from './env';
import { buildIngestServer } from './ingest/server';
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
import { LivePriceProvider, StubPriceProvider } from './chain/price';
import type { ChainClient } from './chain/types';
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

  const chain: ChainClient = env.HELIUS_API_KEY ? new HeliusClient() : new NullChainClient();
  if (!env.HELIUS_API_KEY) {
    log.warn('HELIUS_API_KEY not set — running with NullChainClient (replay-only mode)');
  }
  const price = env.PRICE_MODE === 'stub' ? new StubPriceProvider() : new LivePriceProvider();
  log.info({ mode: env.PRICE_MODE }, 'price provider');
  const signals = new StubClusterSignalProvider();
  const bot = createBot();

  // ── BullMQ consumers ──────────────────────────────────────────
  const connection = createRedis();

  const backfillWorker = new Worker<BackfillDevJob>(
    QUEUE.backfillDev,
    async (job) => {
      const result = await backfillDev(job.data.wallet, {
        chain,
        price,
        db: prismaBackfillDb,
        log: (msg, fields) => log.info(fields ?? {}, msg),
      });
      if (!result.skipped) await refreshDev(job.data.wallet);
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

  // ── Payment watcher: every 20 seconds ─────────────────────────
  let payTimer: NodeJS.Timeout | null = null;
  if (env.TREASURY_WALLET && env.HELIUS_API_KEY) {
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
    }, 20_000);
  } else {
    log.warn('payment watcher disabled (TREASURY_WALLET or HELIUS_API_KEY missing)');
  }

  // ── Telegram bot (long polling) ───────────────────────────────
  if (bot) {
    bot.catch((err) => log.error({ err: err.message }, 'telegram bot error'));
    void bot.start({ onStart: (me) => log.info({ username: me.username }, 'telegram bot up') });
  } else {
    log.warn('telegram bot disabled (TELEGRAM_BOT_TOKEN missing)');
  }

  await app.listen({ port: env.WORKER_PORT, host: '0.0.0.0' });
  log.info({ port: env.WORKER_PORT }, 'devradar worker up');

  // ── Graceful shutdown ─────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    clearInterval(cronTimer);
    if (payTimer) clearInterval(payTimer);
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
