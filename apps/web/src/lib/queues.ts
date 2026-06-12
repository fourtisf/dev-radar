import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

/**
 * Producer-side handles to the worker's queues. Names and jobId
 * conventions must stay in sync with apps/worker/src/lib/queues.ts.
 */
const globalForQueues = globalThis as unknown as {
  bullConnection?: Redis;
  backfillQueue?: Queue;
  traceResolveQueue?: Queue;
};

function connection(): Redis {
  if (!globalForQueues.bullConnection) {
    globalForQueues.bullConnection = new Redis(
      process.env.REDIS_URL ?? 'redis://localhost:6379',
      { maxRetriesPerRequest: null },
    );
  }
  return globalForQueues.bullConnection;
}

export function backfillQueue(): Queue {
  if (!globalForQueues.backfillQueue) {
    globalForQueues.backfillQueue = new Queue('backfill-dev', {
      connection: connection(),
      defaultJobOptions: { attempts: 4, backoff: { type: 'exponential', delay: 2000 } },
    });
  }
  return globalForQueues.backfillQueue;
}

export function traceResolveQueue(): Queue {
  if (!globalForQueues.traceResolveQueue) {
    globalForQueues.traceResolveQueue = new Queue('trace-resolve', {
      connection: connection(),
      defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 2000 } },
    });
  }
  return globalForQueues.traceResolveQueue;
}

export async function enqueueBackfill(wallet: string): Promise<void> {
  await backfillQueue().add('backfill', { wallet }, { jobId: `bf:${wallet}` });
}

export async function enqueueTraceResolve(query: string): Promise<void> {
  await traceResolveQueue().add('resolve', { query }, { jobId: `tr:${query}` });
}
