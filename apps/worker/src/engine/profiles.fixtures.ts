/**
 * The three reference dossiers from the prototype's hero card
 * (reference/devradar-site.html). The handoff pins their DR Score
 * bands: winner 82–96 · rugger 4–16 · fresh 35–60. Tuning weights in
 * config.ts must keep these in band.
 */
import type { ClassifyInput } from './classify';
import type { ScoreInput } from './score';

export interface ReferenceProfile {
  name: string;
  classify: ClassifyInput;
  score: ScoreInput;
  scoreBand: [number, number];
}

const DAY = 86_400_000;
export const NOW = new Date('2026-06-01T12:00:00Z');

/** 7xKp····9fQm — 14 launches, 0 rugs, best ATH $4.2M, CEX-funded. */
export const WINNER_PROFILE: ReferenceProfile = {
  name: 'winner 7xKp····9fQm',
  classify: {
    firstSeenAt: new Date(NOW.getTime() - 14 * 30 * DAY), // 14 months
    launchCount: 14,
    rugCount: 0,
    bestAthUsd: 4_200_000,
    fundingType: 'CEX_CLEAN',
    resolvedCount: 13, // one launch still LIVE
    backfillComplete: true,
  },
  score: {
    launchCount: 14,
    rugCount: 0,
    cleanCount: 13,
    bestAthUsd: 4_200_000,
    bundlePct: 4.1,
    sniperLvl: 'LOW',
    fundingType: 'CEX_CLEAN',
  },
  scoreBand: [82, 96],
};

/** Dk3r····x2Vn — 31 launches, 87% rug rate, best ATH $310K. */
export const RUGGER_PROFILE: ReferenceProfile = {
  name: 'rugger Dk3r····x2Vn',
  classify: {
    firstSeenAt: new Date(NOW.getTime() - 2 * 30 * DAY), // 2 months
    launchCount: 31,
    rugCount: 27,
    bestAthUsd: 310_000,
    fundingType: 'LINKED_FLAGGED',
    resolvedCount: 31,
    backfillComplete: true,
  },
  score: {
    launchCount: 31,
    rugCount: 27,
    cleanCount: 4,
    bestAthUsd: 310_000,
    bundlePct: 20,
    sniperLvl: 'HIGH',
    fundingType: 'UNVERIFIED',
  },
  scoreBand: [4, 16],
};

/** 9mTw····k4Lp — first seen 2 hours ago, single deploy, unverified inflow. */
export const FRESH_PROFILE: ReferenceProfile = {
  name: 'fresh 9mTw····k4Lp',
  classify: {
    firstSeenAt: new Date(NOW.getTime() - 2 * 3_600_000), // 2 hours
    launchCount: 1,
    rugCount: 0,
    bestAthUsd: 0,
    fundingType: 'UNVERIFIED',
    resolvedCount: 0,
    backfillComplete: false, // fresh wallet, backfill still cold
  },
  score: {
    launchCount: 1,
    rugCount: 0,
    cleanCount: 0,
    bestAthUsd: 0,
    bundlePct: 9,
    sniperLvl: 'MED',
    fundingType: 'UNVERIFIED',
  },
  scoreBand: [35, 60],
};

export const REFERENCE_PROFILES = [WINNER_PROFILE, RUGGER_PROFILE, FRESH_PROFILE];
