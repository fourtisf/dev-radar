import { ENGINE } from './config';
import { clamp, type FundType, type Verdict } from './types';

export interface ClassifyInput {
  firstSeenAt: Date;
  launchCount: number;
  rugCount: number;
  bestAthUsd: number;
  fundingType: FundType;
  /** Tokens whose outcome is no longer LIVE. */
  resolvedCount: number;
  /** False while the dev's history hasn't been fully backfilled. */
  backfillComplete: boolean;
}

export interface Classification {
  verdict: Verdict;
  confidence: number; // 0–100
  rugRate: number;
  walletAgeDays: number;
}

/** Handoff 7.2 — order matters: WINNER, RUGGER, FRESH, NEUTRAL. */
export function classify(
  input: ClassifyInput,
  now: Date = new Date(),
  cfg = ENGINE.classify,
): Classification {
  const walletAgeDays = (now.getTime() - input.firstSeenAt.getTime()) / 86_400_000;
  const rugRate = input.rugCount / Math.max(input.launchCount, 1);

  let verdict: Verdict = 'NEUTRAL';
  if (
    input.launchCount >= cfg.winnerMinLaunches &&
    rugRate <= cfg.winnerMaxRugRate &&
    input.bestAthUsd >= cfg.winnerMinBestAthUsd
  ) {
    verdict = 'WINNER';
  } else if (
    (input.launchCount >= cfg.ruggerMinLaunches && rugRate >= cfg.ruggerMinRugRate) ||
    (input.fundingType === 'LINKED_FLAGGED' && input.launchCount >= cfg.ruggerFlaggedMinLaunches)
  ) {
    verdict = 'RUGGER';
  } else if (
    input.launchCount <= cfg.freshMaxLaunches &&
    walletAgeDays < cfg.freshMaxWalletAgeDays
  ) {
    verdict = 'FRESH';
  }

  let confidence = Math.min(
    cfg.confidenceCap,
    cfg.confidenceBase + cfg.confidencePerResolved * input.resolvedCount,
  );
  if (!input.backfillComplete) confidence -= cfg.confidenceBackfillPenalty;
  if (verdict === 'FRESH') confidence = Math.max(cfg.confidenceFreshFloor, confidence);

  return { verdict, confidence: Math.round(clamp(confidence, 0, 100)), rugRate, walletAgeDays };
}
