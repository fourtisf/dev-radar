import { ENGINE } from './config';
import { clamp, type FundType, type SnipeLvl } from './types';

export interface ScoreInput {
  launchCount: number;
  rugCount: number;
  cleanCount: number;
  bestAthUsd: number;
  bundlePct: number;
  sniperLvl: SnipeLvl;
  fundingType: FundType;
}

/**
 * Handoff 7.3 — DR Score, clamped 0–100. UI bands: ≥70 green ·
 * 40–69 gold · <40 red.
 */
export function drScore(i: ScoreInput, cfg = ENGINE.score): number {
  const rugRate = i.rugCount / Math.max(i.launchCount, 1);

  let score: number = cfg.base;
  // track record up
  score += Math.min(
    cfg.trackRecordCap,
    i.cleanCount * cfg.cleanWeight + Math.log10(Math.max(i.bestAthUsd, 1)) * cfg.athLogWeight,
  );
  // rug history down
  score -= Math.min(
    cfg.rugCap,
    rugRate * cfg.rugWeight * Math.min(i.launchCount / cfg.rugLaunchNorm, 1),
  );
  // bundle penalty
  score -= Math.min(cfg.bundleCap, Math.max(0, i.bundlePct - cfg.bundleFreePct) * cfg.bundleWeight);
  // snipers
  score -= cfg.sniperPenalty[i.sniperLvl];
  // funding origin
  score += cfg.fundingDelta[i.fundingType];

  // fresh uncertainty band
  if (i.launchCount <= cfg.freshMaxLaunches) {
    score = clamp(score, cfg.freshBandLo, cfg.freshBandHi);
  }

  return Math.round(clamp(score, 0, 100));
}

export type ScoreBand = 'hi' | 'mid' | 'lo';

/** UI band helper: ≥70 green (hi) · 40–69 gold (mid) · <40 red (lo). */
export function scoreBand(score: number): ScoreBand {
  return score >= 70 ? 'hi' : score >= 40 ? 'mid' : 'lo';
}
