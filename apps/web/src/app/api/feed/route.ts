import { NextResponse, type NextRequest } from 'next/server';
import { prisma, type Verdict } from '@devradar/db';
import { devDto, tokenDto } from '@/lib/dossier';
import { globalIpLimit, SCOUT_FEED_DELAY_S } from '@/lib/limits';
import { effectiveTier, getSessionUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE = 50;
const FILTER_VERDICT: Record<string, Verdict> = {
  win: 'WINNER',
  rug: 'RUGGER',
  fresh: 'FRESH',
};

function decodeCursor(raw: string | null): { createdAt: Date; mint: string } | null {
  if (!raw) return null;
  try {
    const [iso, mint] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    if (!iso || !mint) return null;
    return { createdAt: new Date(iso), mint };
  } catch {
    return null;
  }
}

/** GET /api/feed?cursor=&filter=all|win|rug|fresh → recent deploys (50/page). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;

  const user = await getSessionUser();
  const tier = effectiveTier(user);

  const filter = req.nextUrl.searchParams.get('filter') ?? 'all';
  const cursor = decodeCursor(req.nextUrl.searchParams.get('cursor'));
  const verdict = FILTER_VERDICT[filter];

  // SCOUT (and logged-out): rows older than 5 minutes only.
  const delayedBefore =
    tier === 'SCOUT' ? new Date(Date.now() - SCOUT_FEED_DELAY_S * 1000) : null;

  const tokens = await prisma.token.findMany({
    where: {
      ...(verdict ? { dev: { verdict } } : {}),
      ...(delayedBefore ? { createdAt: { lte: delayedBefore } } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, mint: { lt: cursor.mint } },
            ],
          }
        : {}),
    },
    include: { dev: true },
    orderBy: [{ createdAt: 'desc' }, { mint: 'desc' }],
    take: PAGE,
  });

  const last = tokens[tokens.length - 1];
  const nextCursor = last
    ? Buffer.from(`${last.createdAt.toISOString()}|${last.mint}`).toString('base64url')
    : null;

  return NextResponse.json({
    tier,
    delaySeconds: tier === 'SCOUT' ? SCOUT_FEED_DELAY_S : 0,
    rows: tokens.map((t) => ({ token: tokenDto(t), dev: devDto(t.dev) })),
    nextCursor,
  });
}
