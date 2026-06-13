import { NextResponse, type NextRequest } from 'next/server';
import { redis } from './redis';

/** Sliding-window-ish counter: INCR + EXPIRE on first hit. */
export async function rateLimit(
  key: string,
  limit: number,
  windowS: number,
): Promise<{ ok: boolean; remaining: number }> {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowS);
  return { ok: count <= limit, remaining: Math.max(0, limit - count) };
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

/** Global per-IP limit on everything under /api (handoff Section 8). */
export async function globalIpLimit(req: NextRequest): Promise<NextResponse | null> {
  const ip = clientIp(req);
  const minute = Math.floor(Date.now() / 60_000);
  const { ok } = await rateLimit(`rl:ip:${ip}:${minute}`, 240, 90);
  if (!ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  return null;
}

export const SCOUT_DOSSIERS_PER_DAY = 10;
// The live feed is the public demo — show it in real time so the site
// never looks empty. Monetisation stays on dossiers (10/day quota) +
// Telegram alerts (Operator) + unlimited trace. Set SCOUT_FEED_DELAY_S
// in the env to re-introduce a paywall delay (e.g. 300 = 5 min).
export const SCOUT_FEED_DELAY_S = Number(process.env.SCOUT_FEED_DELAY_S ?? 0);

/** SCOUT: 10 dossier requests/day, keyed wallet||ip (Redis counter). */
export async function scoutDossierQuota(
  identity: string,
): Promise<{ ok: boolean; used: number; limit: number }> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `dossier:${identity}:${day}`;
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, 86_400);
  return { ok: used <= SCOUT_DOSSIERS_PER_DAY, used, limit: SCOUT_DOSSIERS_PER_DAY };
}
