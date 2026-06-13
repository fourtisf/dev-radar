import { ENGINE } from './config';
import type { Outcome } from './types';

/**
 * Everything the outcome rules (handoff 7.1) need to know about a LIVE
 * token at evaluation time. Cluster signals default to "nothing
 * observed" when a provider can't supply them (e.g. historical
 * backfill) — the rules then simply never fire the RUG branch.
 */
export interface OutcomeInput {
  /** Seconds since launch. */
  ageS: number;
  /** Highest market cap observed so far (USD). */
  peakMcapUsd: number;
  /** Latest market cap (USD). */
  currentMcapUsd: number;
  /** Share of LP removed by the dev cluster, 0–100. */
  devClusterLpRemovedPct?: number;
  /** Share of supply sold by the dev cluster within 24h of launch, 0–100. */
  devClusterSoldPct24h?: number;
  /** Largest drop from peak observed inside a 1h window, 0–100. */
  dropFromPeakPct1h?: number;
  /** Did the dev cluster sell inside that drop window? */
  devClusterSellsInDropWindow?: boolean;
}

const H = 3600;

export function isRugTriggered(i: OutcomeInput, cfg = ENGINE.outcome): boolean {
  if ((i.devClusterLpRemovedPct ?? 0) > cfg.rugLpRemovedPct) return true;
  if ((i.devClusterSoldPct24h ?? 0) > cfg.rugDevSoldPct) return true;
  // Price-collapse rug: a token that pumped to a real peak and then
  // craters ≥97% is a dump/rug. On pump.fun this is reliable on price
  // alone, so dev-sell confirmation is optional (rugRequiresDevSell).
  // The peak floor stops dead microcaps (that never pumped) being
  // mislabelled — those resolve to DEAD by age instead.
  if (
    (i.dropFromPeakPct1h ?? 0) >= cfg.rugDropFromPeakPct &&
    i.peakMcapUsd >= cfg.rugMinPeakUsd &&
    (!cfg.rugRequiresDevSell || (i.devClusterSellsInDropWindow ?? false))
  ) {
    return true;
  }
  return false;
}

/** Handoff 7.1: RUG → CLEAN → DEAD → LIVE, first rule that fires wins. */
export function decideOutcome(i: OutcomeInput, cfg = ENGINE.outcome): Outcome {
  if (isRugTriggered(i, cfg)) return 'RUG';
  const oldEnough = i.ageS >= cfg.resolveAgeH * H;
  if (oldEnough && i.peakMcapUsd >= cfg.cleanPeakUsd) return 'CLEAN';
  if (oldEnough && i.currentMcapUsd < cfg.deadMcapUsd) return 'DEAD';
  return 'LIVE';
}

/**
 * Snapshot cadence (7.1): every 10 min for age < 24h, hourly until
 * 72h, then stop.
 */
export function shouldSnapshot(
  ageS: number,
  lastSnapshotAgeS: number | null,
  cfg = ENGINE.snapshots,
): boolean {
  if (ageS >= cfg.stopAfterH * H) return false;
  if (lastSnapshotAgeS === null) return true;
  const everyMin = ageS < cfg.fastUntilH * H ? cfg.fastEveryMin : cfg.slowEveryMin;
  // 30s of slack so a cron that ticks every 10 min reliably hits hourly marks.
  return lastSnapshotAgeS >= everyMin * 60 - 30;
}
