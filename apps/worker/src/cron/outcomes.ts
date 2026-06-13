import { prisma } from '@devradar/db';
import type { PriceProvider } from '../chain/types';
import { ENGINE } from '../engine/config';
import { decideOutcome, shouldSnapshot, type OutcomeInput } from '../engine/outcomes';
import { refreshDev } from '../jobs/refreshDev';

/**
 * Source for dev-cluster behaviour signals (LP pulls, cluster sells).
 * Stubbed for MVP — wire to Helius transfer monitoring when the field
 * mapping is verified. Without signals the RUG branch simply never
 * fires from the cron (CLEAN/DEAD still resolve by age + mcap).
 */
export interface ClusterSignalProvider {
  getSignals(
    mint: string,
    devWallet: string,
  ): Promise<Pick<
    OutcomeInput,
    | 'devClusterLpRemovedPct'
    | 'devClusterSoldPct24h'
    | 'dropFromPeakPct1h'
    | 'devClusterSellsInDropWindow'
  >>;
}

export class StubClusterSignalProvider implements ClusterSignalProvider {
  async getSignals(): Promise<Record<string, never>> {
    return {};
  }
}

/**
 * Outcome tick (handoff 7.1) — run every 10 minutes:
 * snapshot LIVE tokens per cadence, apply outcome rules, update dev
 * aggregates + classification + DR Score for affected devs.
 */
export async function runOutcomeTick(
  price: PriceProvider,
  signals: ClusterSignalProvider = new StubClusterSignalProvider(),
  now: Date = new Date(),
): Promise<{ checked: number; resolved: number }> {
  const live = await prisma.token.findMany({
    where: { outcome: 'LIVE' },
    orderBy: { createdAt: 'asc' },
    take: 2000,
  });

  const touchedDevs = new Set<string>();
  let resolved = 0;

  for (const token of live) {
    const ageS = (now.getTime() - token.createdAt.getTime()) / 1000;

    let currentMcapUsd = 0;
    let peakMcapUsd = Number(token.peakMcapUsd);

    const lastSnap = await prisma.tokenSnapshot.findFirst({
      where: { mint: token.mint },
      orderBy: { ts: 'desc' },
    });
    const lastSnapshotAgeS = lastSnap ? (now.getTime() - lastSnap.ts.getTime()) / 1000 : null;

    if (shouldSnapshot(ageS, lastSnapshotAgeS)) {
      const quote = await price.getMcapAndLiq(token.mint);
      if (quote) {
        currentMcapUsd = quote.mcapUsd;
        peakMcapUsd = Math.max(peakMcapUsd, quote.mcapUsd);
        await prisma.tokenSnapshot.create({
          data: { mint: token.mint, ts: now, mcapUsd: quote.mcapUsd, liqUsd: quote.liqUsd },
        });
      }
    } else if (lastSnap) {
      currentMcapUsd = Number(lastSnap.mcapUsd);
    }

    const clusterSignals = await signals.getSignals(token.mint, token.devWallet);
    // Derive the price-collapse rug signal from peak vs current (only
    // when we actually have a current price — a missing price must not
    // look like a 100% crash).
    const dropFromPeakPct1h =
      currentMcapUsd > 0 && peakMcapUsd > 0
        ? Math.max(0, ((peakMcapUsd - currentMcapUsd) / peakMcapUsd) * 100)
        : undefined;
    const outcome = decideOutcome({
      ageS,
      peakMcapUsd,
      currentMcapUsd,
      ...(dropFromPeakPct1h !== undefined ? { dropFromPeakPct1h } : {}),
      ...clusterSignals,
    });

    if (outcome !== 'LIVE') {
      await prisma.token.update({
        where: { mint: token.mint },
        data: {
          outcome,
          peakMcapUsd,
          lifespanS:
            outcome === 'RUG'
              ? Math.round(Math.min(ageS, ENGINE.outcome.rugDevSoldWindowH * 3600))
              : Math.round(ageS),
        },
      });
      touchedDevs.add(token.devWallet);
      resolved++;
    } else if (peakMcapUsd > Number(token.peakMcapUsd)) {
      await prisma.token.update({
        where: { mint: token.mint },
        data: { peakMcapUsd },
      });
    }
  }

  for (const wallet of touchedDevs) {
    await refreshDev(wallet);
  }

  return { checked: live.length, resolved };
}
