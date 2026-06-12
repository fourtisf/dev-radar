import { describe, expect, it } from 'vitest';
import { devAggregates } from './aggregates';

describe('devAggregates', () => {
  it('counts outcomes, best ATH and median lifespan over resolved tokens', () => {
    const agg = devAggregates([
      { outcome: 'CLEAN', peakMcapUsd: 4_200_000, lifespanS: 950_000 },
      { outcome: 'CLEAN', peakMcapUsd: 860_000, lifespanS: 700_000 },
      { outcome: 'RUG', peakMcapUsd: 95_000, lifespanS: 2_500 },
      { outcome: 'DEAD', peakMcapUsd: 4_000, lifespanS: 260_000 },
      { outcome: 'LIVE', peakMcapUsd: 1_200_000, lifespanS: 0 },
    ]);
    expect(agg.launchCount).toBe(5);
    expect(agg.cleanCount).toBe(2);
    expect(agg.rugCount).toBe(1);
    expect(agg.resolvedCount).toBe(4);
    expect(agg.bestAthUsd).toBe(4_200_000);
    // sorted resolved lifespans: 2500, 260000, 700000, 950000 → median (260000+700000)/2
    expect(agg.medianLifespanS).toBe(480_000);
  });

  it('handles a dev with no tokens', () => {
    const agg = devAggregates([]);
    expect(agg).toEqual({
      launchCount: 0,
      rugCount: 0,
      cleanCount: 0,
      resolvedCount: 0,
      bestAthUsd: 0,
      medianLifespanS: 0,
    });
  });

  it('odd number of resolved lifespans → middle value', () => {
    const agg = devAggregates([
      { outcome: 'RUG', peakMcapUsd: 1, lifespanS: 100 },
      { outcome: 'RUG', peakMcapUsd: 1, lifespanS: 300 },
      { outcome: 'DEAD', peakMcapUsd: 1, lifespanS: 200 },
    ]);
    expect(agg.medianLifespanS).toBe(200);
  });
});
