import { describe, expect, it } from 'vitest';
import { drScore, scoreBand } from './score';
import { FRESH_PROFILE, REFERENCE_PROFILES, RUGGER_PROFILE, WINNER_PROFILE } from './profiles.fixtures';

describe('drScore — reference dossiers (handoff 7.3)', () => {
  it.each(REFERENCE_PROFILES.map((p) => [p.name, p] as const))('%s lands in band', (_, p) => {
    const s = drScore(p.score);
    expect(s).toBeGreaterThanOrEqual(p.scoreBand[0]);
    expect(s).toBeLessThanOrEqual(p.scoreBand[1]);
  });

  it('winner profile scores exactly per formula (50 + 35 + 6 = 91)', () => {
    expect(drScore(WINNER_PROFILE.score)).toBe(91);
  });

  it('rugger with flagged funding bottoms out below the band ceiling', () => {
    const s = drScore({ ...RUGGER_PROFILE.score, fundingType: 'LINKED_FLAGGED' });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(16);
  });

  it('fresh wallets are clamped to the 30–60 uncertainty band', () => {
    // Even a perfect-looking fresh wallet cannot exceed 60 …
    const high = drScore({
      launchCount: 1,
      rugCount: 0,
      cleanCount: 1,
      bestAthUsd: 10_000_000,
      bundlePct: 0,
      sniperLvl: 'LOW',
      fundingType: 'CEX_CLEAN',
    });
    expect(high).toBe(60);
    // … and an awful-looking one cannot drop below 30.
    const low = drScore({
      launchCount: 2,
      rugCount: 2,
      cleanCount: 0,
      bestAthUsd: 0,
      bundlePct: 45,
      sniperLvl: 'HIGH',
      fundingType: 'LINKED_FLAGGED',
    });
    expect(low).toBe(30);
  });

  it('bundle penalty only starts above 8% and caps at 20', () => {
    const base = { ...WINNER_PROFILE.score };
    expect(drScore({ ...base, bundlePct: 8 })).toBe(drScore({ ...base, bundlePct: 0 }));
    const at10 = drScore({ ...base, bundlePct: 10 });
    expect(drScore({ ...base, bundlePct: 0 }) - at10).toBeCloseTo(2, 0); // (10-8)*1.2 ≈ 2.4 → rounded
    // cap: 60% bundle penalised same as 25% (both hit the 20 cap)
    expect(drScore({ ...base, bundlePct: 60 })).toBe(drScore({ ...base, bundlePct: 25 }));
  });

  it('sniper and funding modifiers apply per config', () => {
    const base = WINNER_PROFILE.score;
    expect(drScore(base) - drScore({ ...base, sniperLvl: 'MED' })).toBe(8);
    expect(drScore(base) - drScore({ ...base, sniperLvl: 'HIGH' })).toBe(16);
    expect(drScore(base) - drScore({ ...base, fundingType: 'MIXER' })).toBe(21); // +6 → −15
  });

  it('clamps to 0–100', () => {
    const s = drScore({
      launchCount: 40,
      rugCount: 40,
      cleanCount: 0,
      bestAthUsd: 0,
      bundlePct: 80,
      sniperLvl: 'HIGH',
      fundingType: 'LINKED_FLAGGED',
    });
    expect(s).toBe(0);
  });

  it('scoreBand matches UI bands (≥70 hi · 40–69 mid · <40 lo)', () => {
    expect(scoreBand(drScore(WINNER_PROFILE.score))).toBe('hi');
    expect(scoreBand(drScore(FRESH_PROFILE.score))).toBe('lo'); // 37
    expect(scoreBand(40)).toBe('mid');
    expect(scoreBand(69)).toBe('mid');
    expect(scoreBand(70)).toBe('hi');
    expect(scoreBand(39)).toBe('lo');
  });
});
