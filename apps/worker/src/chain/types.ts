import type { LaunchBuy } from '../engine/bundle';
import type { FundingEdge } from '../engine/funding';

/** A raw enhanced transaction as returned by Helius (loosely typed). */
export type EnhancedTx = Record<string, unknown>;

/** Best-effort launch stats for a (possibly historical) token. */
export interface TokenLaunchStats {
  peakMcapUsd: number;
  currentMcapUsd: number;
  /** Cluster signals — only present when the data source can derive them. */
  devClusterLpRemovedPct?: number;
  devClusterSoldPct24h?: number;
  dropFromPeakPct1h?: number;
  devClusterSellsInDropWindow?: boolean;
}

export interface TreasuryTransfer {
  signature: string;
  fromWallet: string;
  amountSol: number;
  memo: string | null;
  ts: number;
}

/**
 * Everything the workers need from the chain, behind one interface so
 * tests can mock it (Prompt 4/5 acceptance). The Helius implementation
 * lives in helius.ts.
 */
export interface ChainClient {
  /** Full wallet history (enhanced transactions), oldest → newest. */
  getWalletTransactions(wallet: string): Promise<EnhancedTx[]>;
  /** Buys that landed in the first N slots after the create. */
  getLaunchBuys(mint: string, createdSlot: number): Promise<LaunchBuy[]>;
  /** First-2-slot total supply denominator for bundle %. */
  getTokenSupply(mint: string): Promise<number>;
  /** Incoming SOL transfers (for the funding BFS). */
  getIncomingSolTransfers(wallet: string): Promise<FundingEdge[]>;
  /** Direct funding parents for launch-buy cluster detection. */
  getFundingParents(wallets: string[]): Promise<Record<string, string[]>>;
  /** Peak/current mcap + optional cluster signals. */
  getTokenLaunchStats(mint: string): Promise<TokenLaunchStats | null>;
  /** Resolve a mint to its deployer (for /trace on unknown tokens). */
  getTokenDeployer(mint: string): Promise<{ wallet: string; createdAt: Date } | null>;
  /** Recent transfers into the treasury (payment watcher). */
  getTreasuryTransfers(treasury: string): Promise<TreasuryTransfer[]>;
}

/** Market data source for snapshots (stubbed until a feed is wired). */
export interface PriceProvider {
  getMcapAndLiq(mint: string): Promise<{ mcapUsd: number; liqUsd: number } | null>;
}
