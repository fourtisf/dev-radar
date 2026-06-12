import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { globalIpLimit } from '@/lib/limits';
import { redis } from '@/lib/redis';
import { BASE58_RE, buildSiwsMessage } from '@/lib/siws';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NONCE_TTL_S = 300; // 5 minutes

/** POST /api/auth/nonce {wallet} → nonce + the exact message to sign. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;

  let wallet: unknown;
  try {
    wallet = ((await req.json()) as { wallet?: unknown }).wallet;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  if (typeof wallet !== 'string' || !BASE58_RE.test(wallet)) {
    return NextResponse.json({ error: 'invalid_wallet' }, { status: 400 });
  }

  const nonce = randomBytes(16).toString('hex');
  await redis.set(`siws:nonce:${wallet}`, nonce, 'EX', NONCE_TTL_S);

  return NextResponse.json({ nonce, message: buildSiwsMessage(wallet, nonce) });
}
