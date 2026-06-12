import type { Outcome } from './types';

/** The slice of a Token row the dev-aggregate math needs. */
export interface TokenAggRow {
  outcome: Outcome;
  peakMcapUsd: number;
  lifespanS: number;
}

export interface DevAggregates {
  launchCount: number;
  rugCount: number;
  cleanCount: number;
  resolvedCount: number;
  bestAthUsd: number;
  medianLifespanS: number;
}

/**
 * Recomputes Dev aggregates from the dev's token rows. Median lifespan
 * is taken over resolved tokens with a known lifespan.
 */
export function devAggregates(tokens: TokenAggRow[]): DevAggregates {
  const resolved = tokens.filter((t) => t.outcome !== 'LIVE');
  const lifespans = resolved
    .map((t) => t.lifespanS)
    .filter((s) => s > 0)
    .sort((a, b) => a - b);

  let median = 0;
  if (lifespans.length > 0) {
    const mid = Math.floor(lifespans.length / 2);
    median =
      lifespans.length % 2 === 1
        ? lifespans[mid]!
        : Math.round((lifespans[mid - 1]! + lifespans[mid]!) / 2);
  }

  return {
    launchCount: tokens.length,
    rugCount: tokens.filter((t) => t.outcome === 'RUG').length,
    cleanCount: tokens.filter((t) => t.outcome === 'CLEAN').length,
    resolvedCount: resolved.length,
    bestAthUsd: tokens.reduce((max, t) => Math.max(max, t.peakMcapUsd), 0),
    medianLifespanS: median,
  };
}
