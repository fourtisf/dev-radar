import { ENGINE } from './config';

/** A buy that landed in the first N slots after launch (7.4). */
export interface LaunchBuy {
  wallet: string;
  /** Token amount bought, in whole tokens. */
  tokens: number;
  /** 0-based slot offset from the create slot (only 0..launchSlots-1 considered). */
  slotOffset: number;
}

export interface BundleInput {
  deployer: string;
  buys: LaunchBuy[];
  /** Total token supply, same unit as LaunchBuy.tokens. */
  totalSupply: number;
  /**
   * Direct funding parents per wallet (who sent it SOL), used to walk
   * ancestry up to `fundingHops` hops. Missing key = no known parents.
   */
  fundingParents: Record<string, string[]>;
}

export interface BundleResult {
  /** Clustered share of supply bought, 0–100. */
  bundlePct: number;
  /** Wallets that belong to the dev/shared-funding cluster. */
  clusterWallets: string[];
  /** ≥ hotPct — matches the UI's "hot" flag. */
  hot: boolean;
}

/** Funding ancestors of a wallet within `hops` hops (excludes the wallet itself). */
export function fundingAncestors(
  wallet: string,
  parents: Record<string, string[]>,
  hops: number,
): Set<string> {
  const out = new Set<string>();
  let frontier = [wallet];
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const w of frontier) {
      for (const p of parents[w] ?? []) {
        if (!out.has(p)) {
          out.add(p);
          next.push(p);
        }
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * Handoff 7.4 — take buyers in the first 2 slots, cluster wallets that
 * share a funding parent within 2 hops or are funded by the deployer.
 * bundlePct = clustered share of supply bought.
 */
export function detectBundle(input: BundleInput, cfg = ENGINE.bundle): BundleResult {
  const buys = input.buys.filter((b) => b.slotOffset < cfg.launchSlots);

  // Aggregate per wallet (a wallet can buy in both slots).
  const byWallet = new Map<string, number>();
  for (const b of buys) byWallet.set(b.wallet, (byWallet.get(b.wallet) ?? 0) + b.tokens);

  const wallets = [...byWallet.keys()];
  const ancestors = new Map<string, Set<string>>(
    wallets.map((w) => [w, fundingAncestors(w, input.fundingParents, cfg.fundingHops)]),
  );

  const clustered = new Set<string>();
  for (const w of wallets) {
    const anc = ancestors.get(w)!;
    if (anc.has(input.deployer) || w === input.deployer) {
      clustered.add(w);
      continue;
    }
    for (const other of wallets) {
      if (other === w) continue;
      const otherAnc = ancestors.get(other)!;
      let shares = false;
      for (const a of anc) {
        if (otherAnc.has(a)) {
          shares = true;
          break;
        }
      }
      if (shares) {
        clustered.add(w);
        break;
      }
    }
  }

  const clusteredTokens = [...clustered].reduce((sum, w) => sum + (byWallet.get(w) ?? 0), 0);
  const pct =
    input.totalSupply > 0 ? Math.round((clusteredTokens / input.totalSupply) * 1000) / 10 : 0;

  return { bundlePct: pct, clusterWallets: [...clustered].sort(), hot: pct >= cfg.hotPct };
}
