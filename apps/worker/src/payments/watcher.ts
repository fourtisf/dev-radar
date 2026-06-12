import { prisma, type Tier } from '@devradar/db';
import type { ChainClient } from '../chain/types';

/**
 * Tier pricing in SOL. Placeholders pending ALFA's go/no-go on final
 * pricing (handoff Section 14.5). Keep in sync with the web pricing
 * page and pay modal.
 */
export const TIER_PRICE_SOL: Record<Exclude<Tier, 'SCOUT'>, number> = {
  OPERATOR: 2,
  SYNDICATE: 8,
};

export const TIER_DURATION_DAYS = 30;
const AMOUNT_TOLERANCE = 0.02; // ±2%

export const MEMO_RE = /^DR-([A-Za-z0-9_-]+)$/;

export function matchTierByAmount(amountSol: number): Exclude<Tier, 'SCOUT'> | null {
  for (const [tier, price] of Object.entries(TIER_PRICE_SOL) as [
    Exclude<Tier, 'SCOUT'>,
    number,
  ][]) {
    // tiny epsilon so the documented ±2% boundary itself passes (fp rounding)
    if (Math.abs(amountSol - price) / price <= AMOUNT_TOLERANCE + 1e-9) return tier;
  }
  return null;
}

/**
 * Payment watcher (handoff Section 11): poll treasury transfers every
 * 20s, match memo `DR-<userId>`, ±2% amount tolerance → upsert Payment
 * + extend tier 30 days. No memo / no match → payments_unmatched.
 * Duplicate signature → ignore.
 */
export async function pollPayments(
  chain: ChainClient,
  treasury: string,
  log: (msg: string, fields?: Record<string, unknown>) => void = () => undefined,
): Promise<void> {
  const transfers = await chain.getTreasuryTransfers(treasury);

  for (const t of transfers) {
    if (!t.signature) continue;

    const [seen, held] = await Promise.all([
      prisma.payment.findUnique({ where: { signature: t.signature } }),
      prisma.paymentUnmatched.findUnique({ where: { signature: t.signature } }),
    ]);
    if (seen || held) continue; // duplicate → ignore

    const memoMatch = t.memo ? MEMO_RE.exec(t.memo.trim()) : null;
    const tier = matchTierByAmount(t.amountSol);
    const user = memoMatch
      ? await prisma.user.findUnique({ where: { id: memoMatch[1]! } })
      : null;

    if (!memoMatch || !user || !tier) {
      await prisma.paymentUnmatched.create({
        data: {
          signature: t.signature,
          fromWallet: t.fromWallet,
          amountSol: t.amountSol,
          memo: t.memo,
        },
      });
      log('payment held for review', {
        signature: t.signature,
        amountSol: t.amountSol,
        reason: !memoMatch ? 'no-memo' : !user ? 'unknown-user' : 'amount-mismatch',
      });
      continue;
    }

    if (t.amountSol !== TIER_PRICE_SOL[tier]) {
      log('payment amount off but within ±2% — accepted', {
        signature: t.signature,
        amountSol: t.amountSol,
        tier,
      });
    }

    const now = new Date();
    const base =
      user.tier === tier && user.tierExpires && user.tierExpires > now
        ? user.tierExpires
        : now;
    const tierExpires = new Date(base.getTime() + TIER_DURATION_DAYS * 86_400_000);

    await prisma.$transaction([
      prisma.payment.create({
        data: { signature: t.signature, wallet: t.fromWallet, amountSol: t.amountSol, tier },
      }),
      prisma.user.update({ where: { id: user.id }, data: { tier, tierExpires } }),
    ]);
    log('payment verified — tier upgraded', { userId: user.id, tier, tierExpires });
  }
}
