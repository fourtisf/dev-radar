import { Redis } from 'ioredis';

const globalForRedis = globalThis as unknown as { redis?: Redis };

function create(): Redis {
  // lazyConnect: route modules are imported during `next build` —
  // never dial Redis until a request actually needs it.
  const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  client.on('error', (err) => {
    console.warn('[redis]', err.message);
  });
  return client;
}

export const redis: Redis = globalForRedis.redis ?? create();

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;
