import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@devradar/db';
import { devDto } from '@/lib/dossier';
import { globalIpLimit } from '@/lib/limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/leaderboard?type=winners|ruggers → top 20 by DR Score
 * (score rides on each dev's latest launch; winners high → low,
 * ruggers low → high).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;

  const type = req.nextUrl.searchParams.get('type') === 'ruggers' ? 'ruggers' : 'winners';
  const verdict = type === 'winners' ? 'WINNER' : 'RUGGER';

  const devs = await prisma.dev.findMany({
    where: { verdict },
    orderBy: { bestAthUsd: 'desc' },
    take: 60,
  });

  const rows = await Promise.all(
    devs.map(async (dev) => {
      const latest = await prisma.token.findFirst({
        where: { devWallet: dev.wallet },
        orderBy: { createdAt: 'desc' },
        select: { drScore: true },
      });
      return { dev: devDto(dev), drScore: latest?.drScore ?? 50 };
    }),
  );

  rows.sort((a, b) => (type === 'winners' ? b.drScore - a.drScore : a.drScore - b.drScore));
  return NextResponse.json({ type, rows: rows.slice(0, 20) });
}
