import { NextResponse, type NextRequest } from 'next/server';
import { globalIpLimit } from '@/lib/limits';
import { clearSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/auth/logout — clears the session cookie. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;
  clearSession();
  return NextResponse.json({ ok: true });
}
