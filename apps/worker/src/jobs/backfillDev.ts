import { ENGINE } from '../engine/config';
import { devAggregates } from '../engine/aggregates';
import { classify } from '../engine/classify';
import { decideOutcome } from '../engine/outcomes';
import type { FundType, Outcome } from '../engine/types';
import { parseCreateTx } from '../ingest/parse';
import type { ChainClient, PriceProvider } from '../chain/types';

const H = 3600;

/** Narrow persistence interface so tests run against an in-memory fake. */
export interface BackfillDb {
  getDev(wallet: string): Promise<{
    wallet: string;
    firstSeenAt: Date;
    backfilledAt: Date | null;
    fundingType: FundType;
  } | null>;
  createDev(wallet: string, firstSeenAt: Date): Promise<void>;
  upsertToken(token: {
    mint: string;
    devWallet: string;
    name: string;
    symbol: string;
    venue: string;
    createdAt: Date;
    outcome: Outcome;
    peakMcapUsd: number;
    lifespanS: number;
  }): Promise<void>;
  getDevTokens(wallet: string): Promise<{ outcome: Outcome; peakMcapUsd: number; lifespanS: number }[]>;
  updateDev(
    wallet: string,
    data: {
      firstSeenAt: Date;
      verdict: string;
      confidence: number;
      launchCount: number;
      rugCount: number;
      cleanCount: number;
      bestAthUsd: number;
      medianLifespanS: number;
      backfilledAt: Date;
    },
  ): Promise<void>;
}

export interface BackfillDeps {
  chain: ChainClient;
  price: PriceProvider;
  db: BackfillDb;
  now?: () => Date;
  log?: (msg: string, fields?: Record<string, unknown>) => void;
}

export interface BackfillResult {
  skipped: boolean;
  tokensFound: number;
  durationMs: number;
}

/**
 * `backfill-dev` consumer (Prompt 5): walk the dev wallet's history,
 * collect prior pump.fun creates, resolve outcomes where data allows
 * (else DEAD if old and worthless), update aggregates + classify +
 * score, stamp backfilledAt. Skips if backfilled < 24h ago.
 *
 * GET /api/dev/:wallet relies on this returning within ~10s for
 * typical wallets — duration is logged on every run.
 */
export async function backfillDev(wallet: string, deps: BackfillDeps): Promise<BackfillResult> {
  const started = performance.now();
  const now = deps.now?.() ?? new Date();
  const log = deps.log ?? (() => undefined);

  let dev = await deps.db.getDev(wallet);
  if (dev?.backfilledAt && now.getTime() - dev.backfilledAt.getTime() < ENGINE.backfill.ttlH * H * 1000) {
    log('backfill skipped (fresh)', { wallet });
    return { skipped: true, tokensFound: 0, durationMs: performance.now() - started };
  }
  if (!dev) {
    await deps.db.createDev(wallet, now);
    dev = { wallet, firstSeenAt: now, backfilledAt: null, fundingType: 'UNVERIFIED' };
  }

  const history = await deps.chain.getWalletTransactions(wallet);

  // Wallet age = earliest transaction ever seen, creates or not.
  let firstSeenAt = dev.firstSeenAt;
  for (const tx of history) {
    const ts = tx['timestamp'];
    if (typeof ts === 'number') {
      const d = new Date(ts * 1000);
      if (d < firstSeenAt) firstSeenAt = d;
    }
  }

  const creates = history
    .map((tx) => parseCreateTx(tx))
    .filter((ev): ev is NonNullable<typeof ev> => ev !== null && ev.deployer === wallet);

  for (const ev of creates) {
    const ageS = Math.max(0, (now.getTime() - ev.timestamp.getTime()) / 1000);
    const stats = await deps.chain.getTokenLaunchStats(ev.mint);
    const spot = stats ? null : await deps.price.getMcapAndLiq(ev.mint);
    const peak = stats?.peakMcapUsd ?? spot?.mcapUsd ?? 0;
    const current = stats?.currentMcapUsd ?? spot?.mcapUsd ?? 0;

    const outcome = decideOutcome({
      ageS,
      peakMcapUsd: peak,
      currentMcapUsd: current,
      devClusterLpRemovedPct: stats?.devClusterLpRemovedPct,
      devClusterSoldPct24h: stats?.devClusterSoldPct24h,
      dropFromPeakPct1h: stats?.dropFromPeakPct1h,
      devClusterSellsInDropWindow: stats?.devClusterSellsInDropWindow,
    });

    // Historical lifespan is approximate: rugs die inside the 24h sell
    // window, anything else we cap at the 72h resolution age.
    const lifespanS =
      outcome === 'LIVE'
        ? 0
        : outcome === 'RUG'
          ? Math.min(ageS, ENGINE.outcome.rugDevSoldWindowH * H)
          : Math.min(ageS, ENGINE.outcome.resolveAgeH * H);

    await deps.db.upsertToken({
      mint: ev.mint,
      devWallet: wallet,
      name: ev.name,
      symbol: ev.symbol,
      venue: ev.venue,
      createdAt: ev.timestamp,
      outcome,
      peakMcapUsd: peak,
      lifespanS: Math.round(lifespanS),
    });
  }

  const tokens = await deps.db.getDevTokens(wallet);
  const agg = devAggregates(tokens);
  const cls = classify(
    {
      firstSeenAt,
      launchCount: agg.launchCount,
      rugCount: agg.rugCount,
      bestAthUsd: agg.bestAthUsd,
      fundingType: dev.fundingType,
      resolvedCount: agg.resolvedCount,
      backfillComplete: true, // we just completed it
    },
    now,
  );

  await deps.db.updateDev(wallet, {
    firstSeenAt,
    verdict: cls.verdict,
    confidence: cls.confidence,
    launchCount: agg.launchCount,
    rugCount: agg.rugCount,
    cleanCount: agg.cleanCount,
    bestAthUsd: agg.bestAthUsd,
    medianLifespanS: agg.medianLifespanS,
    backfilledAt: now,
  });

  const durationMs = Math.round(performance.now() - started);
  log('backfill complete', { wallet, tokens: creates.length, durationMs });
  return { skipped: false, tokensFound: creates.length, durationMs };
}
