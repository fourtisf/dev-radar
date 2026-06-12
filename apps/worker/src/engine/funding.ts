import { ENGINE } from './config';
import type { FundingHop, FundType } from './types';

/** An incoming SOL transfer into a wallet. */
export interface FundingEdge {
  from: string;
  sol: number;
  /** Unix ms. */
  ts: number;
}

/** Async source of incoming SOL transfers (mocked in tests, Helius in prod). */
export interface FundingLookup {
  getIncomingSolTransfers(wallet: string): Promise<FundingEdge[]>;
}

/** Label lookups built from KnownAddress + flagged dev clusters. */
export interface KnownSets {
  /** address → label, e.g. "Binance 8" */
  cex: ReadonlyMap<string, string>;
  /** address → label, e.g. "FixedFloat" */
  mixer: ReadonlyMap<string, string>;
  /** address → label, any wallet in a flagged=true dev's cluster */
  flagged: ReadonlyMap<string, string>;
}

export interface FundingResult {
  fundingType: FundType;
  /** Deployer → … → matched wallet, persisted to Dev.fundingPath. */
  path: FundingHop[];
}

interface Visit {
  wallet: string;
  hop: number;
  via: FundingEdge;
  parent: Visit | null;
}

/**
 * Handoff 7.6 — BFS backwards on incoming SOL transfers from the
 * deployer wallet, max 3 hops, max 25 wallets. First match wins:
 * cex → CEX_CLEAN · mixer/instant-swap → MIXER · flagged cluster →
 * LINKED_FLAGGED · nothing in 3 hops → UNVERIFIED.
 */
export async function traceFunding(
  deployer: string,
  lookup: FundingLookup,
  known: KnownSets,
  cfg = ENGINE.funding,
): Promise<FundingResult> {
  const visited = new Set<string>([deployer]);
  let frontier: Visit[] = [{ wallet: deployer, hop: 0, via: { from: '', sol: 0, ts: 0 }, parent: null }];
  let walletsSeen = 0;

  const classify = (wallet: string): { type: FundType; label: string } | null => {
    const cex = known.cex.get(wallet);
    if (cex !== undefined) return { type: 'CEX_CLEAN', label: cex };
    const mixer = known.mixer.get(wallet);
    if (mixer !== undefined) return { type: 'MIXER', label: mixer };
    const flagged = known.flagged.get(wallet);
    if (flagged !== undefined) return { type: 'LINKED_FLAGGED', label: flagged };
    return null;
  };

  const pathTo = (v: Visit, label: string): FundingHop[] => {
    const hops: FundingHop[] = [];
    for (let cur: Visit | null = v; cur !== null && cur.hop > 0; cur = cur.parent) {
      hops.unshift({
        wallet: cur.wallet,
        label: cur.wallet === v.wallet ? label : null,
        hop: cur.hop,
        sol: cur.via.sol,
        ts: cur.via.ts,
      });
    }
    return hops;
  };

  for (let hop = 1; hop <= cfg.maxHops; hop++) {
    const next: Visit[] = [];
    for (const node of frontier) {
      const edges = await lookup.getIncomingSolTransfers(node.wallet);
      // Newest inflows first — the most recent funding is the relevant lineage.
      edges.sort((a, b) => b.ts - a.ts);
      for (const edge of edges) {
        if (visited.has(edge.from)) continue;
        visited.add(edge.from);
        walletsSeen++;
        const visit: Visit = { wallet: edge.from, hop, via: edge, parent: node };
        const match = classify(edge.from);
        if (match) return { fundingType: match.type, path: pathTo(visit, match.label) };
        next.push(visit);
        if (walletsSeen >= cfg.maxWallets) {
          return { fundingType: 'UNVERIFIED', path: [] };
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  return { fundingType: 'UNVERIFIED', path: [] };
}
