import { prisma, type Dev } from '@devradar/db';
import { devAggregates } from '../engine/aggregates';
import { classify } from '../engine/classify';
import { drScore } from '../engine/score';
import { CHANNEL, pgNotify } from '../lib/notify';

/**
 * Recomputes a dev's aggregates from its token rows, re-runs classify
 * + score, persists, refreshes DR Scores of the dev's LIVE tokens and
 * NOTIFYs 'dossier-update'. Called after outcome flips, launch
 * analysis and backfill.
 */
export async function refreshDev(wallet: string): Promise<Dev | null> {
  const dev = await prisma.dev.findUnique({ where: { wallet } });
  if (!dev) return null;

  const tokens = await prisma.token.findMany({
    where: { devWallet: wallet },
    orderBy: { createdAt: 'desc' },
  });

  const agg = devAggregates(
    tokens.map((t) => ({
      outcome: t.outcome,
      peakMcapUsd: Number(t.peakMcapUsd),
      lifespanS: t.lifespanS,
    })),
  );

  const cls = classify({
    firstSeenAt: dev.firstSeenAt,
    launchCount: agg.launchCount,
    rugCount: agg.rugCount,
    bestAthUsd: agg.bestAthUsd,
    fundingType: dev.fundingType,
    resolvedCount: agg.resolvedCount,
    backfillComplete: dev.backfilledAt !== null,
  });

  // Per-token DR Score: dev record + the token's own bundle/sniper read.
  const liveTokens = tokens.filter((t) => t.outcome === 'LIVE').slice(0, 20);
  for (const t of liveTokens) {
    const score = drScore({
      launchCount: agg.launchCount,
      rugCount: agg.rugCount,
      cleanCount: agg.cleanCount,
      bestAthUsd: agg.bestAthUsd,
      bundlePct: Number(t.bundlePct),
      sniperLvl: t.sniperLvl,
      fundingType: dev.fundingType,
    });
    if (score !== t.drScore) {
      await prisma.token.update({ where: { mint: t.mint }, data: { drScore: score } });
      t.drScore = score;
    }
  }

  const updated = await prisma.dev.update({
    where: { wallet },
    data: {
      verdict: cls.verdict,
      confidence: cls.confidence,
      launchCount: agg.launchCount,
      rugCount: agg.rugCount,
      cleanCount: agg.cleanCount,
      bestAthUsd: agg.bestAthUsd,
      medianLifespanS: agg.medianLifespanS,
    },
  });

  const latest = tokens[0];
  await pgNotify(CHANNEL.dossierUpdate, {
    type: 'dossier-update',
    wallet,
    verdict: updated.verdict,
    drScore: latest?.drScore ?? 50,
    ...(latest
      ? {
          mint: latest.mint,
          bundlePct: Number(latest.bundlePct),
          sniperLvl: latest.sniperLvl,
        }
      : {}),
  });

  return updated;
}
