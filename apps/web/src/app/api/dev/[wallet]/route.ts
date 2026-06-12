import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@devradar/db';
import { dossierDto } from '@/lib/dossier';
import { clientIp, globalIpLimit, scoutDossierQuota } from '@/lib/limits';
import { enqueueBackfill } from '@/lib/queues';
import { effectiveTier, getSessionUser } from '@/lib/session';
import { BASE58_RE } from '@/lib/siws';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/dev/:wallet → full dossier. Unknown wallet → enqueue
 * backfill and answer 202 (client polls). SCOUT burns one of 10
 * daily dossier credits per *new* dossier opened.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { wallet: string } },
): Promise<NextResponse> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;

  const wallet = params.wallet;
  if (!BASE58_RE.test(wallet)) {
    return NextResponse.json({ error: 'invalid_wallet' }, { status: 400 });
  }

  const dev = await prisma.dev.findUnique({ where: { wallet } });
  if (!dev) {
    await enqueueBackfill(wallet);
    return NextResponse.json({ status: 'tracing', wallet }, { status: 202 });
  }

  // Quota burns only when a dossier is actually served (202s are free).
  const user = await getSessionUser();
  const tier = effectiveTier(user);
  if (tier === 'SCOUT') {
    const identity = user?.wallet ?? clientIp(req);
    const quota = await scoutDossierQuota(identity);
    if (!quota.ok) {
      return NextResponse.json(
        { error: 'dossier_quota', used: quota.used, limit: quota.limit, tier },
        { status: 429 },
      );
    }
  }

  // Known dev whose history has gone stale → opportunistic re-backfill
  // (worker skips if < 24h fresh, so this is cheap to fire).
  if (!dev.backfilledAt) await enqueueBackfill(wallet);

  const tokens = await prisma.token.findMany({
    where: { devWallet: wallet },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  return NextResponse.json(dossierDto(dev, tokens));
}
