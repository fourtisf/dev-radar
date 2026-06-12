import { describe, expect, it, vi } from 'vitest';
import { backfillDev, type BackfillDb } from './backfillDev';
import type { ChainClient, EnhancedTx, TokenLaunchStats } from '../chain/types';
import { NullPriceProvider } from '../chain/price';

const NOW = new Date('2026-06-01T12:00:00Z');
const DEV = 'BACKF1LLDEVxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const DAY = 86_400;

function createTx(i: number, tsSec: number): EnhancedTx {
  return {
    signature: `sig-create-${i}`,
    slot: 1000 + i,
    timestamp: tsSec,
    type: 'CREATE',
    source: 'PUMP_FUN',
    feePayer: DEV,
    description: `${DEV} created Token ${i} ($TOK${i})`,
    instructions: [{ programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P' }],
    tokenTransfers: [{ mint: `MINT${i}`, toUserAccount: DEV }],
  };
}

function otherTx(i: number, tsSec: number): EnhancedTx {
  return { signature: `sig-other-${i}`, timestamp: tsSec, type: 'TRANSFER', feePayer: DEV };
}

/**
 * 40-tx history (Prompt 5 acceptance): 8 pump.fun creates among 32
 * unrelated transactions. Stats give: 3 CLEAN (peak ≥100k, old),
 * 1 RUG (dev cluster sold 85% in 24h), 3 DEAD (old + worthless),
 * 1 LIVE (recent).
 */
function buildHistory(): { txs: EnhancedTx[]; stats: Map<string, TokenLaunchStats> } {
  const nowSec = NOW.getTime() / 1000;
  const txs: EnhancedTx[] = [];
  const stats = new Map<string, TokenLaunchStats>();

  const creates: [number, number, TokenLaunchStats][] = [
    [1, nowSec - 200 * DAY, { peakMcapUsd: 4_200_000, currentMcapUsd: 120_000 }],
    [2, nowSec - 150 * DAY, { peakMcapUsd: 860_000, currentMcapUsd: 40_000 }],
    [3, nowSec - 100 * DAY, { peakMcapUsd: 150_000, currentMcapUsd: 15_000 }],
    [4, nowSec - 90 * DAY, { peakMcapUsd: 95_000, currentMcapUsd: 600, devClusterSoldPct24h: 85 }],
    [5, nowSec - 80 * DAY, { peakMcapUsd: 8_000, currentMcapUsd: 300 }],
    [6, nowSec - 70 * DAY, { peakMcapUsd: 5_000, currentMcapUsd: 100 }],
    [7, nowSec - 60 * DAY, { peakMcapUsd: 2_000, currentMcapUsd: 50 }],
    [8, nowSec - 0.5 * DAY, { peakMcapUsd: 30_000, currentMcapUsd: 25_000 }],
  ];
  for (const [i, ts, s] of creates) {
    txs.push(createTx(i, ts));
    stats.set(`MINT${i}`, s);
  }
  for (let i = 0; i < 32; i++) {
    txs.push(otherTx(i, nowSec - (210 - i) * DAY));
  }
  txs.sort((a, b) => (a['timestamp'] as number) - (b['timestamp'] as number));
  return { txs, stats };
}

function fakeChain(history: EnhancedTx[], stats: Map<string, TokenLaunchStats>): ChainClient {
  return {
    getWalletTransactions: vi.fn(async () => history),
    getLaunchBuys: async () => [],
    getTokenSupply: async () => 1_000_000_000,
    getIncomingSolTransfers: async () => [],
    getFundingParents: async () => ({}),
    getTokenLaunchStats: async (mint) => stats.get(mint) ?? null,
    getTokenDeployer: async () => null,
    getTreasuryTransfers: async () => [],
  };
}

interface DevRow {
  wallet: string;
  firstSeenAt: Date;
  backfilledAt: Date | null;
  fundingType: 'CEX_CLEAN' | 'UNVERIFIED' | 'MIXER' | 'LINKED_FLAGGED';
  agg?: Record<string, unknown>;
}

function fakeDb(): BackfillDb & { devs: Map<string, DevRow>; tokens: Map<string, Parameters<BackfillDb['upsertToken']>[0]> } {
  const devs = new Map<string, DevRow>();
  const tokens = new Map<string, Parameters<BackfillDb['upsertToken']>[0]>();
  return {
    devs,
    tokens,
    async getDev(wallet) {
      return devs.get(wallet) ?? null;
    },
    async createDev(wallet, firstSeenAt) {
      devs.set(wallet, { wallet, firstSeenAt, backfilledAt: null, fundingType: 'UNVERIFIED' });
    },
    async upsertToken(t) {
      tokens.set(t.mint, t);
    },
    async getDevTokens(wallet) {
      return [...tokens.values()]
        .filter((t) => t.devWallet === wallet)
        .map((t) => ({ outcome: t.outcome, peakMcapUsd: t.peakMcapUsd, lifespanS: t.lifespanS }));
    },
    async updateDev(wallet, data) {
      const dev = devs.get(wallet);
      if (!dev) throw new Error('dev missing');
      devs.set(wallet, { ...dev, firstSeenAt: data.firstSeenAt, backfilledAt: data.backfilledAt, agg: data });
    },
  };
}

describe('backfillDev — mocked 40-tx history', () => {
  it('produces correct aggregates and stamps backfilledAt', async () => {
    const { txs, stats } = buildHistory();
    const db = fakeDb();
    const chain = fakeChain(txs, stats);

    const result = await backfillDev(DEV, {
      chain,
      price: new NullPriceProvider(),
      db,
      now: () => NOW,
    });

    expect(result.skipped).toBe(false);
    expect(result.tokensFound).toBe(8);

    const dev = db.devs.get(DEV)!;
    const agg = dev.agg!;
    expect(agg['launchCount']).toBe(8);
    expect(agg['cleanCount']).toBe(3); // MINT1-3: peak ≥ 100k, no rug trigger
    expect(agg['rugCount']).toBe(1); // MINT4: dev cluster sold 85% in 24h
    expect(agg['bestAthUsd']).toBe(4_200_000);
    expect(dev.backfilledAt).toEqual(NOW);
    // firstSeenAt walked back to the oldest tx in the history (210d ago)
    expect(dev.firstSeenAt.getTime()).toBeLessThanOrEqual(NOW.getTime() - 209 * 86_400_000);

    expect(db.tokens.get('MINT4')?.outcome).toBe('RUG');
    expect(db.tokens.get('MINT5')?.outcome).toBe('DEAD');
    expect(db.tokens.get('MINT8')?.outcome).toBe('LIVE'); // 12h old

    // rugRate 1/8 > 0.10 blocks WINNER; old wallet, many launches → NEUTRAL
    expect(agg['verdict']).toBe('NEUTRAL');
  });

  it('re-running within 24h is a no-op', async () => {
    const { txs, stats } = buildHistory();
    const db = fakeDb();
    const chain = fakeChain(txs, stats);
    const deps = { chain, price: new NullPriceProvider(), db, now: () => NOW };

    await backfillDev(DEV, deps);
    const second = await backfillDev(DEV, {
      ...deps,
      now: () => new Date(NOW.getTime() + 6 * 3_600_000), // 6h later
    });

    expect(second.skipped).toBe(true);
    expect(chain.getWalletTransactions).toHaveBeenCalledTimes(1);

    // …but after the 24h TTL it runs again.
    const third = await backfillDev(DEV, {
      ...deps,
      now: () => new Date(NOW.getTime() + 25 * 3_600_000),
    });
    expect(third.skipped).toBe(false);
    expect(chain.getWalletTransactions).toHaveBeenCalledTimes(2);
  });
});
