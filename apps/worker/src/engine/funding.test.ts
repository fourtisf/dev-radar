import { describe, expect, it } from 'vitest';
import { traceFunding, type FundingEdge, type FundingLookup, type KnownSets } from './funding';

function lookupFrom(graph: Record<string, FundingEdge[]>): FundingLookup {
  return {
    getIncomingSolTransfers: async (wallet) => graph[wallet] ?? [],
  };
}

const known: KnownSets = {
  cex: new Map([['BINANCE8', 'Binance 8']]),
  mixer: new Map([['FIXEDFLOAT', 'FixedFloat']]),
  flagged: new Map([['RUGCLUSTER1', 'Flagged rugger cluster Dk0f']]),
};

describe('traceFunding — handoff 7.6', () => {
  it('clean CEX path: dev ← mule ← Binance 8 → CEX_CLEAN with full path', async () => {
    const r = await traceFunding(
      'DEV',
      lookupFrom({
        DEV: [{ from: 'MULE', sol: 12.5, ts: 1000 }],
        MULE: [{ from: 'BINANCE8', sol: 13, ts: 900 }],
      }),
      known,
    );
    expect(r.fundingType).toBe('CEX_CLEAN');
    expect(r.path).toEqual([
      { wallet: 'MULE', label: null, hop: 1, sol: 12.5, ts: 1000 },
      { wallet: 'BINANCE8', label: 'Binance 8', hop: 2, sol: 13, ts: 900 },
    ]);
  });

  it('mixer one hop away → MIXER', async () => {
    const r = await traceFunding(
      'DEV',
      lookupFrom({ DEV: [{ from: 'FIXEDFLOAT', sol: 5, ts: 100 }] }),
      known,
    );
    expect(r.fundingType).toBe('MIXER');
    expect(r.path).toHaveLength(1);
    expect(r.path[0]?.label).toBe('FixedFloat');
  });

  it('flagged cluster at hop 3 → LINKED_FLAGGED', async () => {
    const r = await traceFunding(
      'DEV',
      lookupFrom({
        DEV: [{ from: 'A', sol: 1, ts: 300 }],
        A: [{ from: 'B', sol: 1, ts: 200 }],
        B: [{ from: 'RUGCLUSTER1', sol: 1, ts: 100 }],
      }),
      known,
    );
    expect(r.fundingType).toBe('LINKED_FLAGGED');
    expect(r.path.map((h) => h.wallet)).toEqual(['A', 'B', 'RUGCLUSTER1']);
    expect(r.path[2]?.hop).toBe(3);
  });

  it('match beyond 3 hops is not followed → UNVERIFIED', async () => {
    const r = await traceFunding(
      'DEV',
      lookupFrom({
        DEV: [{ from: 'A', sol: 1, ts: 400 }],
        A: [{ from: 'B', sol: 1, ts: 300 }],
        B: [{ from: 'C', sol: 1, ts: 200 }],
        C: [{ from: 'BINANCE8', sol: 1, ts: 100 }], // hop 4 — out of reach
      }),
      known,
    );
    expect(r.fundingType).toBe('UNVERIFIED');
    expect(r.path).toEqual([]);
  });

  it('3-hop dead end → UNVERIFIED', async () => {
    const r = await traceFunding(
      'DEV',
      lookupFrom({ DEV: [{ from: 'A', sol: 1, ts: 100 }] }),
      known,
    );
    expect(r.fundingType).toBe('UNVERIFIED');
  });

  it('stops at the 25-wallet budget', async () => {
    // 30 unlabeled inflows at hop 1; the CEX sits behind wallet #29 at
    // hop 2 but the budget is exhausted before any hop-2 expansion.
    const fanout: FundingEdge[] = Array.from({ length: 30 }, (_, i) => ({
      from: `W${i}`,
      sol: 1,
      ts: 1000 - i,
    }));
    const graph: Record<string, FundingEdge[]> = { DEV: fanout };
    graph['W29'] = [{ from: 'BINANCE8', sol: 9, ts: 1 }];
    const r = await traceFunding('DEV', lookupFrom(graph), known);
    expect(r.fundingType).toBe('UNVERIFIED');
  });

  it('prefers the most recent inflow when several match at the same hop', async () => {
    const r = await traceFunding(
      'DEV',
      lookupFrom({
        DEV: [
          { from: 'FIXEDFLOAT', sol: 2, ts: 100 },
          { from: 'BINANCE8', sol: 10, ts: 200 }, // newer → wins
        ],
      }),
      known,
    );
    expect(r.fundingType).toBe('CEX_CLEAN');
  });
});
