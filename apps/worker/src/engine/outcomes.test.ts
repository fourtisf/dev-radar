import { describe, expect, it } from 'vitest';
import { decideOutcome, shouldSnapshot } from './outcomes';
import { ENGINE } from './config';

const H = 3600;

describe('decideOutcome — handoff 7.1', () => {
  const base = { ageS: 10 * H, peakMcapUsd: 50_000, currentMcapUsd: 30_000 };

  it('young token with no triggers → LIVE', () => {
    expect(decideOutcome(base)).toBe('LIVE');
  });

  it('dev cluster removes >80% LP → RUG', () => {
    expect(decideOutcome({ ...base, devClusterLpRemovedPct: 81 })).toBe('RUG');
    expect(decideOutcome({ ...base, devClusterLpRemovedPct: 80 })).toBe('LIVE');
  });

  it('dev cluster sells >70% of supply within 24h → RUG', () => {
    expect(decideOutcome({ ...base, devClusterSoldPct24h: 70.5 })).toBe('RUG');
    expect(decideOutcome({ ...base, devClusterSoldPct24h: 70 })).toBe('LIVE');
  });

  it('≥97% collapse from a real peak → RUG on price alone (pump.fun heuristic)', () => {
    // pumped to $50k then craters → rug, no dev-sell signal needed
    expect(
      decideOutcome({ ageS: 2 * H, peakMcapUsd: 50_000, currentMcapUsd: 400, dropFromPeakPct1h: 99 }),
    ).toBe('RUG');
  });

  it('a microcap that never pumped is not a rug (peak floor) → LIVE', () => {
    expect(
      decideOutcome({ ageS: 2 * H, peakMcapUsd: 3_000, currentMcapUsd: 20, dropFromPeakPct1h: 99 }),
    ).toBe('LIVE');
  });

  it('dev-sell confirmation can be required by config when available', () => {
    const strict = { ...ENGINE.outcome, rugRequiresDevSell: true } as unknown as typeof ENGINE.outcome;
    expect(
      decideOutcome({ ageS: 2 * H, peakMcapUsd: 50_000, currentMcapUsd: 400, dropFromPeakPct1h: 99 }, strict),
    ).toBe('LIVE');
    expect(
      decideOutcome(
        { ageS: 2 * H, peakMcapUsd: 50_000, currentMcapUsd: 400, dropFromPeakPct1h: 99, devClusterSellsInDropWindow: true },
        strict,
      ),
    ).toBe('RUG');
  });

  it('peak ≥ $100k and age ≥ 72h with no rug trigger → CLEAN', () => {
    expect(decideOutcome({ ageS: 72 * H, peakMcapUsd: 100_000, currentMcapUsd: 40_000 })).toBe(
      'CLEAN',
    );
    // not old enough yet
    expect(decideOutcome({ ageS: 71 * H, peakMcapUsd: 100_000, currentMcapUsd: 40_000 })).toBe(
      'LIVE',
    );
  });

  it('rug trigger beats CLEAN', () => {
    expect(
      decideOutcome({
        ageS: 100 * H,
        peakMcapUsd: 900_000,
        currentMcapUsd: 1_000,
        devClusterLpRemovedPct: 95,
      }),
    ).toBe('RUG');
  });

  it('age ≥ 72h, mcap < $10k, peak under clean bar → DEAD', () => {
    expect(decideOutcome({ ageS: 73 * H, peakMcapUsd: 60_000, currentMcapUsd: 9_999 })).toBe(
      'DEAD',
    );
    // still worth something → stays LIVE
    expect(decideOutcome({ ageS: 73 * H, peakMcapUsd: 60_000, currentMcapUsd: 15_000 })).toBe(
      'LIVE',
    );
  });
});

describe('shouldSnapshot — cadence 10min/<24h · hourly/<72h · stop', () => {
  it('always snapshots a token with no snapshot yet (until 72h)', () => {
    expect(shouldSnapshot(1 * H, null)).toBe(true);
    expect(shouldSnapshot(80 * H, null)).toBe(false);
  });

  it('age < 24h → every 10 minutes', () => {
    expect(shouldSnapshot(2 * H, 11 * 60)).toBe(true);
    expect(shouldSnapshot(2 * H, 5 * 60)).toBe(false);
  });

  it('24h–72h → hourly', () => {
    expect(shouldSnapshot(30 * H, 10 * 60)).toBe(false);
    expect(shouldSnapshot(30 * H, 61 * 60)).toBe(true);
  });

  it('after 72h → stop', () => {
    expect(shouldSnapshot(73 * H, 10 * H)).toBe(false);
  });
});
