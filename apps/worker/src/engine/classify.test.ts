import { describe, expect, it } from 'vitest';
import { classify } from './classify';
import { FRESH_PROFILE, NOW, RUGGER_PROFILE, WINNER_PROFILE } from './profiles.fixtures';

describe('classify — handoff 7.2', () => {
  it('winner reference profile → WINNER, confidence capped at 99', () => {
    const c = classify(WINNER_PROFILE.classify, NOW);
    expect(c.verdict).toBe('WINNER');
    expect(c.confidence).toBe(99); // 60 + 13*4 = 112 → cap 99
  });

  it('rugger reference profile → RUGGER via rug rate', () => {
    const c = classify(RUGGER_PROFILE.classify, NOW);
    expect(c.verdict).toBe('RUGGER');
    expect(c.rugRate).toBeCloseTo(27 / 31, 5);
  });

  it('LINKED_FLAGGED funding + 2 launches → RUGGER even with zero recorded rugs', () => {
    const c = classify(
      {
        firstSeenAt: new Date(NOW.getTime() - 30 * 86_400_000),
        launchCount: 2,
        rugCount: 0,
        bestAthUsd: 0,
        fundingType: 'LINKED_FLAGGED',
        resolvedCount: 1,
        backfillComplete: true,
      },
      NOW,
    );
    expect(c.verdict).toBe('RUGGER');
  });

  it('fresh reference profile → FRESH, confidence floored at 40', () => {
    const c = classify(FRESH_PROFILE.classify, NOW);
    expect(c.verdict).toBe('FRESH');
    // 60 + 0 − 15 (backfill incomplete) = 45, floor 40 not hit
    expect(c.confidence).toBe(45);

    const colder = classify(
      { ...FRESH_PROFILE.classify, resolvedCount: -2 as number },
      NOW,
    );
    // floor holds even if the inputs would push below 40
    expect(colder.confidence).toBeGreaterThanOrEqual(40);
  });

  it('old wallet with few launches → NEUTRAL (not FRESH)', () => {
    const c = classify(
      {
        firstSeenAt: new Date(NOW.getTime() - 60 * 86_400_000),
        launchCount: 2,
        rugCount: 0,
        bestAthUsd: 50_000,
        fundingType: 'UNVERIFIED',
        resolvedCount: 2,
        backfillComplete: true,
      },
      NOW,
    );
    expect(c.verdict).toBe('NEUTRAL');
  });

  it('boundary: 5 launches, rugRate exactly 0.10, ATH exactly $250k → WINNER', () => {
    const c = classify(
      {
        firstSeenAt: new Date(NOW.getTime() - 365 * 86_400_000),
        launchCount: 10,
        rugCount: 1,
        bestAthUsd: 250_000,
        fundingType: 'UNVERIFIED',
        resolvedCount: 10,
        backfillComplete: true,
      },
      NOW,
    );
    expect(c.verdict).toBe('WINNER');
  });

  it('boundary: rugRate exactly 0.60 at 5 launches → RUGGER', () => {
    const c = classify(
      {
        firstSeenAt: new Date(NOW.getTime() - 365 * 86_400_000),
        launchCount: 5,
        rugCount: 3,
        bestAthUsd: 0,
        fundingType: 'UNVERIFIED',
        resolvedCount: 5,
        backfillComplete: true,
      },
      NOW,
    );
    expect(c.verdict).toBe('RUGGER');
  });

  it('WINNER takes precedence over FRESH-shaped inputs', () => {
    // 6-day-old wallet that somehow has 5 clean launches ≥ $250k → WINNER
    const c = classify(
      {
        firstSeenAt: new Date(NOW.getTime() - 6 * 86_400_000),
        launchCount: 5,
        rugCount: 0,
        bestAthUsd: 300_000,
        fundingType: 'CEX_CLEAN',
        resolvedCount: 5,
        backfillComplete: true,
      },
      NOW,
    );
    expect(c.verdict).toBe('WINNER');
  });
});
