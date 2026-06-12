import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import { prisma, type Tier, type User } from '@devradar/db';

const COOKIE = 'dr_session';
const SESSION_DAYS = 7;

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not configured');
  return new TextEncoder().encode(s);
}

export interface SessionClaims {
  sub: string; // user id
  wallet: string;
}

export async function createSession(user: { id: string; wallet: string }): Promise<void> {
  const jwt = await new SignJWT({ wallet: user.wallet })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());

  cookies().set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export function clearSession(): void {
  cookies().delete(COOKIE);
}

export async function getSession(): Promise<SessionClaims | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== 'string' || typeof payload['wallet'] !== 'string') return null;
    return { sub: payload.sub, wallet: payload['wallet'] as string };
  } catch {
    return null;
  }
}

/** Session + fresh user row (tier may have changed via payments). */
export async function getSessionUser(): Promise<User | null> {
  const claims = await getSession();
  if (!claims) return null;
  return prisma.user.findUnique({ where: { id: claims.sub } });
}

/** Expired paid tiers fall back to SCOUT. */
export function effectiveTier(user: Pick<User, 'tier' | 'tierExpires'> | null): Tier {
  if (!user) return 'SCOUT';
  if (user.tier === 'SCOUT') return 'SCOUT';
  if (user.tierExpires && user.tierExpires.getTime() < Date.now()) return 'SCOUT';
  return user.tier;
}
