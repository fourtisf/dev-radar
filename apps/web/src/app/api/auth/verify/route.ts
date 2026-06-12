import { NextResponse, type NextRequest } from 'next/server';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { prisma } from '@devradar/db';
import { globalIpLimit } from '@/lib/limits';
import { redis } from '@/lib/redis';
import { createSession, effectiveTier } from '@/lib/session';
import { BASE58_RE, buildSiwsMessage } from '@/lib/siws';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/verify {wallet, signature} — verifies the ed25519
 * signature over the SIWS message for the stored nonce, then sets the
 * httpOnly session JWT. Nonces are single-use.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;

  let body: { wallet?: unknown; signature?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const { wallet, signature } = body;
  if (typeof wallet !== 'string' || !BASE58_RE.test(wallet) || typeof signature !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const nonceKey = `siws:nonce:${wallet}`;
  const nonce = await redis.get(nonceKey);
  if (!nonce) {
    return NextResponse.json({ error: 'nonce_expired' }, { status: 401 });
  }

  let valid = false;
  try {
    valid = nacl.sign.detached.verify(
      new TextEncoder().encode(buildSiwsMessage(wallet, nonce)),
      bs58.decode(signature),
      bs58.decode(wallet),
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  await redis.del(nonceKey); // single use

  const user = await prisma.user.upsert({
    where: { wallet },
    create: { wallet },
    update: {},
  });
  await createSession(user);

  return NextResponse.json({
    user: { id: user.id, wallet: user.wallet, tier: effectiveTier(user) },
  });
}
