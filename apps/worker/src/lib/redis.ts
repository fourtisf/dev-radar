import { Redis } from 'ioredis';
import { env } from '../env';

/** Shared connection options; BullMQ requires maxRetriesPerRequest: null. */
export function createRedis(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

export const redis = createRedis();
