import { describe, expect, it } from 'vitest';
import { detectBundle, type BundleInput } from './bundle';
import { countSnipers, sniperLevel } from './snipers';

/**
 * Prompt-4 acceptance fixture: 12 first-2-slot buys.
 *   w1,w2,w3  share funding parent P1 (1 hop)
 *   w4        funded directly by the deployer
 *   w5        funded by P5 ← P1 (shares P1 with w1-w3 at 2 hops)
 *   w6..w12   independent
 * Total supply 1B; clustered buys = 30+25+20+50+15 = 140M → 14.0%.
 */
const fixture: BundleInput = {
  deployer: 'DEVdeployer',
  totalSupply: 1_000_000_000,
  buys: [
    { wallet: 'w1', tokens: 30_000_000, slotOffset: 0 },
    { wallet: 'w2', tokens: 25_000_000, slotOffset: 0 },
    { wallet: 'w3', tokens: 20_000_000, slotOffset: 1 },
    { wallet: 'w4', tokens: 50_000_000, slotOffset: 0 },
    { wallet: 'w5', tokens: 15_000_000, slotOffset: 1 },
    { wallet: 'w6', tokens: 10_000_000, slotOffset: 0 },
    { wallet: 'w7', tokens: 10_000_000, slotOffset: 0 },
    { wallet: 'w8', tokens: 10_000_000, slotOffset: 1 },
    { wallet: 'w9', tokens: 10_000_000, slotOffset: 1 },
    { wallet: 'w10', tokens: 10_000_000, slotOffset: 0 },
    { wallet: 'w11', tokens: 10_000_000, slotOffset: 1 },
    { wallet: 'w12', tokens: 10_000_000, slotOffset: 0 },
  ],
  fundingParents: {
    w1: ['P1'],
    w2: ['P1'],
    w3: ['P1'],
    w4: ['DEVdeployer'],
    w5: ['P5'],
    P5: ['P1'],
    w6: ['P6'],
    w7: ['P7'],
    w8: ['P8'],
    w9: ['P9'],
    w10: ['P10'],
    w11: ['P11'],
    w12: ['P12'],
  },
};

describe('detectBundle — handoff 7.4 (12-buy fixture)', () => {
  it('computes bundlePct from the funding cluster', () => {
    const r = detectBundle(fixture);
    expect(r.clusterWallets).toEqual(['w1', 'w2', 'w3', 'w4', 'w5']);
    expect(r.bundlePct).toBe(14);
    expect(r.hot).toBe(false); // hot threshold is 18%
  });

  it('flags ≥18% as hot', () => {
    const heavier: BundleInput = {
      ...fixture,
      buys: fixture.buys.map((b) =>
        b.wallet === 'w4' ? { ...b, tokens: 100_000_000 } : b,
      ),
    };
    const r = detectBundle(heavier);
    expect(r.bundlePct).toBe(19);
    expect(r.hot).toBe(true);
  });

  it('ignores buys outside the first 2 slots', () => {
    const withLate: BundleInput = {
      ...fixture,
      buys: [...fixture.buys, { wallet: 'w1', tokens: 500_000_000, slotOffset: 2 }],
    };
    expect(detectBundle(withLate).bundlePct).toBe(14);
  });

  it('no shared funding → 0%', () => {
    const clean: BundleInput = {
      deployer: 'DEV',
      totalSupply: 1_000_000,
      buys: [
        { wallet: 'a', tokens: 100_000, slotOffset: 0 },
        { wallet: 'b', tokens: 100_000, slotOffset: 1 },
      ],
      fundingParents: { a: ['X'], b: ['Y'] },
    };
    const r = detectBundle(clean);
    expect(r.bundlePct).toBe(0);
    expect(r.clusterWallets).toEqual([]);
  });
});

describe('snipers — handoff 7.5', () => {
  it('counts first-2-slot buyers excluding the dev cluster', () => {
    const r = detectBundle(fixture);
    const n = countSnipers(fixture.buys, fixture.deployer, r.clusterWallets);
    expect(n).toBe(7); // w6..w12
    expect(sniperLevel(n)).toBe('MED');
  });

  it('bands: <5 LOW · 5–14 MED · ≥15 HIGH', () => {
    expect(sniperLevel(0)).toBe('LOW');
    expect(sniperLevel(4)).toBe('LOW');
    expect(sniperLevel(5)).toBe('MED');
    expect(sniperLevel(14)).toBe('MED');
    expect(sniperLevel(15)).toBe('HIGH');
  });
});
