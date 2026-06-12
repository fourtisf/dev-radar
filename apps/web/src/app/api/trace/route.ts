import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@devradar/db';
import { dossierDto } from '@/lib/dossier';
import { globalIpLimit } from '@/lib/limits';
import { enqueueBackfill, enqueueTraceResolve } from '@/lib/queues';
import { redis } from '@/lib/redis';
import { getSessionUser } from '@/lib/session';
import { BASE58_RE } from '@/lib/siws';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function loadDossier(wallet: string): Promise<ReturnType<typeof dossierDto> | null> {
  const dev = await prisma.dev.findUnique({ where: { wallet } });
  if (!dev) return null;
  const tokens = await prisma.token.findMany({
    where: { devWallet: wallet },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });
  return dossierDto(dev, tokens);
}

/**
 * POST /api/trace {q} — resolve a mint or wallet to its deployer
 * dossier. Cold lookups enqueue chain resolution + backfill and
 * answer 202; the client polls the same query (≤10s cold, ≤2s warm).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;

  let q: unknown;
  try {
    q = ((await req.json()) as { q?: unknown }).q;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  if (typeof q !== 'string' || !BASE58_RE.test(q.trim())) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }
  const query = q.trim();
  const user = await getSessionUser();

  // 1) Known token mint → its deployer's dossier.
  const token = await prisma.token.findUnique({ where: { mint: query } });
  if (token) {
    const dossier = await loadDossier(token.devWallet);
    if (dossier) {
      if (!dossier.dev.backfilled) {
        await enqueueBackfill(token.devWallet);
        return NextResponse.json({ status: 'tracing', wallet: token.devWallet }, { status: 202 });
      }
      await rememberTrace(user?.id, token.devWallet);
      return NextResponse.json({ kind: 'token', mint: query, dossier });
    }
  }

  // 2) Known deployer wallet.
  const dossier = await loadDossier(query);
  if (dossier) {
    if (!dossier.dev.backfilled) {
      await enqueueBackfill(query);
      return NextResponse.json({ status: 'tracing', wallet: query }, { status: 202 });
    }
    await rememberTrace(user?.id, query);
    return NextResponse.json({ kind: 'dev', dossier });
  }

  // 3) Never seen: could be either an unknown mint or an unseen wallet.
  //    The resolver figures it out on-chain; a definitive miss flags
  //    trace:failed so pollers get 404 instead of waiting forever.
  const failed = await redis.get(`trace:failed:${query}`);
  if (failed) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  await enqueueBackfill(query); // cheap if it IS a wallet
  await enqueueTraceResolve(query); // resolves deployer if it's a mint
  return NextResponse.json({ status: 'tracing', query }, { status: 202 });
}

/** Rug-link alerts: remember who traced this dev for 7 days. */
async function rememberTrace(userId: string | undefined, devWallet: string): Promise<void> {
  if (!userId) return;
  const key = `traced:dev:${devWallet}`;
  await redis.sadd(key, userId);
  await redis.expire(key, 7 * 86_400);
}
