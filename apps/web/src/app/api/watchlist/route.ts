import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@devradar/db';
import { devDto } from '@/lib/dossier';
import { globalIpLimit } from '@/lib/limits';
import { getSessionUser } from '@/lib/session';
import { BASE58_RE } from '@/lib/siws';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WATCHLIST_MAX = 100;

/** GET /api/watchlist → followed devs with their latest launch. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const watches = await prisma.watch.findMany({ where: { userId: user.id } });
  const rows = await Promise.all(
    watches.map(async (w) => {
      const dev = await prisma.dev.findUnique({ where: { wallet: w.devWallet } });
      const lastToken = await prisma.token.findFirst({
        where: { devWallet: w.devWallet },
        orderBy: { createdAt: 'desc' },
      });
      return {
        wallet: w.devWallet,
        dev: dev ? devDto(dev) : null,
        lastLaunch: lastToken
          ? {
              mint: lastToken.mint,
              symbol: lastToken.symbol,
              createdAt: lastToken.createdAt.toISOString(),
            }
          : null,
      };
    }),
  );
  return NextResponse.json({ rows });
}

/** POST /api/watchlist {devWallet} → follow. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let devWallet: unknown;
  try {
    devWallet = ((await req.json()) as { devWallet?: unknown }).devWallet;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  if (typeof devWallet !== 'string' || !BASE58_RE.test(devWallet)) {
    return NextResponse.json({ error: 'invalid_wallet' }, { status: 400 });
  }

  const count = await prisma.watch.count({ where: { userId: user.id } });
  if (count >= WATCHLIST_MAX) {
    return NextResponse.json({ error: 'watchlist_full', limit: WATCHLIST_MAX }, { status: 400 });
  }

  await prisma.watch.upsert({
    where: { userId_devWallet: { userId: user.id, devWallet } },
    create: { userId: user.id, devWallet },
    update: {},
  });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/watchlist?devWallet= → unfollow. */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const devWallet = req.nextUrl.searchParams.get('devWallet');
  if (!devWallet || !BASE58_RE.test(devWallet)) {
    return NextResponse.json({ error: 'invalid_wallet' }, { status: 400 });
  }

  await prisma.watch.deleteMany({ where: { userId: user.id, devWallet } });
  return NextResponse.json({ ok: true });
}
