import type { ChainClient } from './types';

/**
 * Chain client used when HELIUS_API_KEY is absent (pure-local dev with
 * the replay script): every lookup comes back empty, so jobs complete
 * with neutral analysis instead of crashing.
 */
export class NullChainClient implements ChainClient {
  async getWalletTransactions(): Promise<never[]> {
    return [];
  }
  async getLaunchBuys(): Promise<never[]> {
    return [];
  }
  async getTokenSupply(): Promise<number> {
    return 1_000_000_000;
  }
  async getIncomingSolTransfers(): Promise<never[]> {
    return [];
  }
  async getFundingParents(): Promise<Record<string, string[]>> {
    return {};
  }
  async getTokenLaunchStats(): Promise<null> {
    return null;
  }
  async getTokenDeployer(): Promise<null> {
    return null;
  }
  async getTreasuryTransfers(): Promise<never[]> {
    return [];
  }
}
