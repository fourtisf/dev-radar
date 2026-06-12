import { NextResponse, type NextRequest } from 'next/server';
import { globalIpLimit } from '@/lib/limits';
import { getSessionUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Keep in sync with apps/worker/src/payments/watcher.ts (placeholders pending ALFA). */
const PRICES = { OPERATOR: 2, SYNDICATE: 8 } as const;

/**
 * GET /api/pay → everything the pay modal needs: treasury address,
 * SOL prices, and (when signed in) the exact memo + Solana Pay URLs.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;

  const treasury = process.env.TREASURY_WALLET ?? '';
  if (!treasury) {
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 });
  }

  const user = await getSessionUser();
  const memo = user ? `DR-${user.id}` : null;

  const solanaPay = (amount: number): string | null =>
    memo
      ? `solana:${treasury}?amount=${amount}&memo=${encodeURIComponent(memo)}&label=${encodeURIComponent('DevRadar')}`
      : null;

  return NextResponse.json({
    treasury,
    memo,
    tiers: {
      OPERATOR: { sol: PRICES.OPERATOR, url: solanaPay(PRICES.OPERATOR) },
      SYNDICATE: { sol: PRICES.SYNDICATE, url: solanaPay(PRICES.SYNDICATE) },
    },
  });
}
