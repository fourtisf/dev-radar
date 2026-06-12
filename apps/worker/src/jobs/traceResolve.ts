import { prisma } from '@devradar/db';
import type { ChainClient } from '../chain/types';
import { redis } from '../lib/redis';
import { backfillQueue, type TraceResolveJob } from '../lib/queues';

export const traceFailedKey = (q: string): string => `trace:failed:${q}`;

/**
 * `trace-resolve` consumer: /api/trace hit a mint we've never seen.
 * Resolve the deployer on-chain, seed Dev + Token, then hand off to
 * backfill. On a miss, flag the query in Redis so the polling client
 * gets a 404 instead of spinning forever.
 */
export async function resolveTrace(job: TraceResolveJob, chain: ChainClient): Promise<void> {
  const q = job.query;
  try {
    const found = await chain.getTokenDeployer(q);
    if (!found) {
      await redis.set(traceFailedKey(q), '1', 'EX', 120);
      return;
    }
    await prisma.dev.upsert({
      where: { wallet: found.wallet },
      create: { wallet: found.wallet, firstSeenAt: found.createdAt },
      update: {},
    });
    await prisma.token.upsert({
      where: { mint: q },
      create: {
        mint: q,
        devWallet: found.wallet,
        name: 'Unknown',
        symbol: 'UNKNOWN',
        createdAt: found.createdAt,
      },
      update: {},
    });
    await backfillQueue.add('backfill', { wallet: found.wallet }, { jobId: `bf:${found.wallet}` });
  } catch (err) {
    await redis.set(traceFailedKey(q), '1', 'EX', 120);
    throw err;
  }
}
