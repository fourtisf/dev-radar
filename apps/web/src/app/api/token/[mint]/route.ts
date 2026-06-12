import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@devradar/db';
import { dossierDto, tokenDto } from '@/lib/dossier';
import { globalIpLimit } from '@/lib/limits';
import { BASE58_RE } from '@/lib/siws';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/token/:mint → token + its deployer's dossier. */
export async function GET(
  req: NextRequest,
  { params }: { params: { mint: string } },
): Promise<NextResponse> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;

  if (!BASE58_RE.test(params.mint)) {
    return NextResponse.json({ error: 'invalid_mint' }, { status: 400 });
  }

  const token = await prisma.token.findUnique({
    where: { mint: params.mint },
    include: { dev: true },
  });
  if (!token) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const tokens = await prisma.token.findMany({
    where: { devWallet: token.devWallet },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  return NextResponse.json({ token: tokenDto(token), dossier: dossierDto(token.dev, tokens) });
}
