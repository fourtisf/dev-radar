/**
 * Every engine threshold lives here (CLAUDE.md rule). These numbers
 * come from handoff Section 7 and WILL be tuned — change them here,
 * never inline in the algorithms.
 */
export const ENGINE = {
  /** 7.1 outcome rules */
  outcome: {
    rugLpRemovedPct: 80, // dev cluster removes >80% LP → RUG
    rugDevSoldPct: 70, // dev cluster sells >70% supply within 24h → RUG
    rugDevSoldWindowH: 24,
    rugDropFromPeakPct: 97, // ≥97% drop from a real peak → RUG (price-collapse)
    rugDropWindowH: 1,
    rugMinPeakUsd: 15_000, // token must have actually pumped to count as a rug
    rugRequiresDevSell: false, // price collapse alone is enough (set true once dev-sell signals exist)
    cleanPeakUsd: 100_000, // CLEAN needs peak ≥ $100k …
    resolveAgeH: 72, // … and age ≥ 72h
    deadMcapUsd: 10_000, // DEAD if age ≥ 72h and mcap < $10k
  },

  /** 7.1 snapshot cadence */
  snapshots: {
    fastEveryMin: 10, // age < 24h
    fastUntilH: 24,
    slowEveryMin: 60, // 24h–72h
    stopAfterH: 72,
  },

  /** 7.2 classification */
  classify: {
    winnerMinLaunches: 5,
    winnerMaxRugRate: 0.1,
    winnerMinBestAthUsd: 250_000,
    ruggerMinLaunches: 5,
    ruggerMinRugRate: 0.6,
    ruggerFlaggedMinLaunches: 2,
    freshMaxLaunches: 2,
    freshMaxWalletAgeDays: 7,
    confidenceBase: 60,
    confidencePerResolved: 4,
    confidenceCap: 99,
    confidenceBackfillPenalty: 15,
    confidenceFreshFloor: 40,
  },

  /** 7.3 DR Score */
  score: {
    base: 50,
    trackRecordCap: 35,
    cleanWeight: 6,
    athLogWeight: 3,
    rugCap: 40,
    rugWeight: 45,
    rugLaunchNorm: 5,
    bundleFreePct: 8,
    bundleWeight: 1.2,
    bundleCap: 20,
    sniperPenalty: { LOW: 0, MED: 8, HIGH: 16 } as const,
    fundingDelta: { CEX_CLEAN: 6, UNVERIFIED: -4, MIXER: -15, LINKED_FLAGGED: -25 } as const,
    freshMaxLaunches: 2,
    freshBandLo: 30, // fresh uncertainty band
    freshBandHi: 60,
  },

  /** 7.4 bundle detection */
  bundle: {
    launchSlots: 2, // buyers in the first 2 slots
    fundingHops: 2, // shared funding parent within 2 hops
    hotPct: 18, // UI flags ≥18% as hot
  },

  /** 7.5 sniper level (first-2-slot buyers excl. dev cluster) */
  snipers: {
    medMin: 5, // <5 LOW · 5–14 MED · ≥15 HIGH
    highMin: 15,
  },

  /** 7.6 funding trace */
  funding: {
    maxHops: 3,
    maxWallets: 25,
  },

  /** backfill */
  backfill: {
    ttlH: 24, // re-backfill only if older than 24h
    concurrency: 3,
  },
} as const;

export type EngineConfig = typeof ENGINE;
