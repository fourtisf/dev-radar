import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { prisma } from '@devradar/db';
import { env } from '../env';
import { alertsQueue, backfillQueue, launchAnalysisQueue } from '../lib/queues';
import { CHANNEL, pgNotify, type DeployNotification } from '../lib/notify';
import { parseWebhookPayload, type LaunchEvent } from './parse';

function authOk(header: string | undefined): boolean {
  const secret = env.HELIUS_WEBHOOK_SECRET;
  if (!secret) return false; // never accept unauthenticated webhooks
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Webhook fast-path (handoff Section 5): verify auth → parse → upsert
 * → enqueue → NOTIFY → 200. No chain calls, no scoring — all heavy
 * work goes through BullMQ. Target <50ms excluding IO waits.
 */
export async function handleLaunchEvent(ev: LaunchEvent): Promise<void> {
  const dev = await prisma.dev.upsert({
    where: { wallet: ev.deployer },
    create: { wallet: ev.deployer, firstSeenAt: ev.timestamp },
    update: {}, // firstSeenAt only set on first sight
  });

  await prisma.token.upsert({
    where: { mint: ev.mint },
    create: {
      mint: ev.mint,
      devWallet: ev.deployer,
      name: ev.name,
      symbol: ev.symbol,
      venue: ev.venue,
      createdAt: ev.timestamp,
      outcome: 'LIVE',
      drScore: 50,
    },
    update: {}, // replays / duplicate deliveries are no-ops
  });

  await Promise.all([
    // NB: BullMQ custom job ids must not contain ':' — base58 ids are safe with '-'.
    backfillQueue.add('backfill', { wallet: ev.deployer }, { jobId: `bf-${ev.deployer}` }),
    launchAnalysisQueue.add(
      'analyze',
      { mint: ev.mint, deployer: ev.deployer, slot: ev.slot },
      { jobId: `la-${ev.mint}` },
    ),
    alertsQueue.add('deploy', {
      mint: ev.mint,
      symbol: ev.symbol,
      name: ev.name,
      ca: ev.mint,
      devWallet: ev.deployer,
      verdict: dev.verdict,
      launchCount: dev.launchCount,
      rugCount: dev.rugCount,
      bestAthUsd: Number(dev.bestAthUsd),
      bundlePct: 0,
      sniperLvl: 'LOW',
      drScore: 50,
    }),
  ]);

  const payload: DeployNotification = {
    type: 'deploy',
    token: {
      mint: ev.mint,
      symbol: ev.symbol,
      name: ev.name,
      venue: ev.venue,
      createdAt: ev.timestamp.toISOString(),
      bundlePct: 0,
      sniperLvl: 'LOW',
      drScore: 50,
    },
    dev: {
      wallet: dev.wallet,
      verdict: dev.verdict,
      confidence: dev.confidence,
      launchCount: dev.launchCount,
      rugCount: dev.rugCount,
      bestAthUsd: Number(dev.bestAthUsd),
      flagged: dev.flagged,
    },
  };
  await pgNotify(CHANNEL.deploys, payload);
}

export function buildIngestServer(): FastifyInstance {
  const app = Fastify({
    logger: { level: env.NODE_ENV === 'production' ? 'info' : 'debug' },
  });

  app.get('/health', async () => ({ ok: true, service: 'devradar-worker' }));

  app.post('/webhook/helius', async (req, reply) => {
    if (!authOk(req.headers.authorization)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const started = performance.now();
    const events = parseWebhookPayload(req.body);
    for (const ev of events) {
      try {
        await handleLaunchEvent(ev);
      } catch (err) {
        // Never 500 the webhook for one bad event — Helius retries are
        // per-delivery, and we must not block the rest of the batch.
        req.log.error({ err, mint: ev.mint }, 'launch fast-path failed');
      }
    }

    const ms = Math.round((performance.now() - started) * 10) / 10;
    req.log.info({ accepted: events.length, ms }, 'webhook processed');
    return reply.code(200).send({ ok: true, accepted: events.length });
  });

  return app;
}
