import { NextResponse, type NextRequest } from 'next/server';
import { globalIpLimit } from '@/lib/limits';
import { effectiveTier, getSessionUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/me → tier, expiry, prefs (anonymous → SCOUT). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ authenticated: false, tier: 'SCOUT' });
  }
  return NextResponse.json({
    authenticated: true,
    id: user.id,
    wallet: user.wallet,
    tier: effectiveTier(user),
    tierExpires: user.tierExpires?.toISOString() ?? null,
    alertPrefs: user.alertPrefs,
    telegramLinked: user.tgChatId !== null,
  });
}
