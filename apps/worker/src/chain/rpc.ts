import { setTimeout as sleep } from 'node:timers/promises';
import { env } from '../env';
import { PUMP_FUN_PROGRAM_ID } from '../ingest/constants';
import type { LaunchBuy } from '../engine/bundle';
import type { FundingEdge } from '../engine/funding';
import type { ChainClient, EnhancedTx, TokenLaunchStats, TreasuryTransfer } from './types';

/**
 * Free public Solana JSON-RPC chain client — no API key, no signup.
 * Implements the same ChainClient interface as HeliusClient using
 * standard `getSignaturesForAddress` + `getTransaction` (jsonParsed).
 *
 * Trade-offs vs Helius: one getTransaction per signature (Helius
 * batches enhanced parsing), and public endpoints rate-limit — so every
 * method is BOUNDED (capped signatures) and FAIL-OPEN (any miss returns
 * empty/null, so the engine degrades to age-based outcomes / no
 * enrichment rather than erroring). Used on-demand only, so the call
 * volume stays low.
 */
const DEFAULT_ENDPOINTS = [
  'https://solana-rpc.publicnode.com',
  'https://rpc.ankr.com/solana',
  'https://api.mainnet-beta.solana.com',
];

interface RpcSig {
  signature: string;
  slot: number;
  blockTime: number | null;
}

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

/** Flatten top-level + inner instructions of a jsonParsed transaction. */
function allInstructions(tx: Record<string, unknown>): Record<string, unknown>[] {
  const message = rec(rec(tx['transaction'])?.['message']);
  const top = Array.isArray(message?.['instructions']) ? (message!['instructions'] as unknown[]) : [];
  const meta = rec(tx['meta']);
  const inner = Array.isArray(meta?.['innerInstructions']) ? (meta!['innerInstructions'] as unknown[]) : [];
  const innerIxs: unknown[] = [];
  for (const group of inner) {
    const g = rec(group);
    if (g && Array.isArray(g['instructions'])) innerIxs.push(...(g['instructions'] as unknown[]));
  }
  return [...top, ...innerIxs].map(rec).filter((x): x is Record<string, unknown> => x !== null);
}

function feePayer(tx: Record<string, unknown>): string | null {
  const keys = rec(rec(tx['transaction'])?.['message'])?.['accountKeys'];
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const first = keys[0];
  if (typeof first === 'string') return first;
  return str(rec(first)?.['pubkey']);
}

export class PublicRpcChainClient implements ChainClient {
  private endpoints: string[];
  private epIdx = 0;
  private lastCallAt = 0;
  private id = 0;

  constructor(
    endpoints?: string[],
    private readonly minIntervalMs = 220, // ~5 req/s, polite to public endpoints
    private readonly maxSignatures = 50,
  ) {
    const fromEnv = env.SOLANA_RPC_URL
      ? env.SOLANA_RPC_URL.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    this.endpoints = endpoints?.length ? endpoints : fromEnv.length ? fromEnv : DEFAULT_ENDPOINTS;
  }

  private async call<T>(method: string, params: unknown[]): Promise<T | null> {
    const tries = this.endpoints.length * 2;
    for (let attempt = 0; attempt <= tries; attempt++) {
      const wait = this.lastCallAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastCallAt = Date.now();
      const url = this.endpoints[this.epIdx % this.endpoints.length]!;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }),
        });
        if (res.status === 429 || res.status >= 500) {
          this.epIdx++;
          await sleep(400 * (attempt + 1));
          continue;
        }
        if (!res.ok) return null;
        const json = rec(await res.json());
        if (!json || json['error']) {
          this.epIdx++;
          continue;
        }
        return (json['result'] ?? null) as T | null;
      } catch {
        this.epIdx++;
        await sleep(300);
      }
    }
    return null;
  }

  private async getSignatures(address: string, limit: number, before?: string): Promise<RpcSig[]> {
    const r = await this.call<RpcSig[]>('getSignaturesForAddress', [
      address,
      before ? { limit, before } : { limit },
    ]);
    return Array.isArray(r) ? r : [];
  }

  private getTx(signature: string): Promise<Record<string, unknown> | null> {
    return this.call<Record<string, unknown>>('getTransaction', [
      signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
    ]);
  }

  /** Wallet history shaped so parseCreateTx (Helius format) can read it. */
  async getWalletTransactions(wallet: string): Promise<EnhancedTx[]> {
    const sigs = await this.getSignatures(wallet, this.maxSignatures);
    const out: EnhancedTx[] = [];
    for (const s of sigs) {
      const ts = s.blockTime ?? 0;
      const tx = await this.getTx(s.signature);
      if (!tx) {
        out.push({ timestamp: ts });
        continue;
      }
      const ixs = allInstructions(tx);
      const touchesPump = ixs.some((ix) => str(ix['programId']) === PUMP_FUN_PROGRAM_ID);
      let createdMint: string | null = null;
      for (const ix of ixs) {
        const parsed = rec(ix['parsed']);
        const type = str(parsed?.['type']) ?? '';
        if (ix['program'] === 'spl-token' && type.startsWith('initializeMint')) {
          createdMint = str(rec(parsed?.['info'])?.['mint']);
        }
      }
      if (touchesPump && createdMint && feePayer(tx) === wallet) {
        out.push({
          type: 'CREATE',
          source: 'PUMP_FUN',
          feePayer: wallet,
          signature: s.signature,
          slot: s.slot,
          timestamp: ts,
          instructions: [{ programId: PUMP_FUN_PROGRAM_ID }],
          tokenTransfers: [{ mint: createdMint, toUserAccount: wallet, tokenAmount: 0 }],
          description: '',
        });
      } else {
        out.push({ timestamp: ts });
      }
    }
    return out;
  }

  /** First-slot token credits = launch buys (jsonParsed token balance deltas). */
  async getLaunchBuys(mint: string, createdSlot: number): Promise<LaunchBuy[]> {
    const sigs = (await this.getSignatures(mint, 30)).sort((a, b) => a.slot - b.slot);
    const anchor = createdSlot && createdSlot > 0 ? createdSlot : sigs[0]?.slot ?? 0;
    if (!anchor) return [];
    const buys: LaunchBuy[] = [];
    for (const s of sigs) {
      const offset = s.slot - anchor;
      if (offset < 0 || offset > 2) continue;
      const tx = await this.getTx(s.signature);
      if (!tx) continue;
      const meta = rec(tx['meta']);
      const pre = Array.isArray(meta?.['preTokenBalances']) ? (meta!['preTokenBalances'] as unknown[]) : [];
      const post = Array.isArray(meta?.['postTokenBalances']) ? (meta!['postTokenBalances'] as unknown[]) : [];
      const before = new Map<string, number>();
      for (const b of pre) {
        const r = rec(b);
        if (str(r?.['mint']) !== mint) continue;
        const owner = str(r?.['owner']);
        if (owner) before.set(owner, num(rec(r?.['uiTokenAmount'])?.['uiAmount']));
      }
      for (const b of post) {
        const r = rec(b);
        if (str(r?.['mint']) !== mint) continue;
        const owner = str(r?.['owner']);
        if (!owner) continue;
        const delta = num(rec(r?.['uiTokenAmount'])?.['uiAmount']) - (before.get(owner) ?? 0);
        if (delta > 0) buys.push({ wallet: owner, tokens: delta, slotOffset: offset });
      }
    }
    return buys;
  }

  async getTokenSupply(mint: string): Promise<number> {
    const r = rec(await this.call('getTokenSupply', [mint]));
    const ui = num(rec(r?.['value'])?.['uiAmount']);
    return ui > 0 ? ui : 1_000_000_000;
  }

  async getIncomingSolTransfers(wallet: string): Promise<FundingEdge[]> {
    return this.incomingTransfers(wallet, 40);
  }

  private async incomingTransfers(wallet: string, sigLimit: number): Promise<FundingEdge[]> {
    const sigs = await this.getSignatures(wallet, sigLimit);
    const edges: FundingEdge[] = [];
    for (const s of sigs) {
      const tx = await this.getTx(s.signature);
      if (!tx) continue;
      const ts = (s.blockTime ?? 0) * 1000;
      for (const ix of allInstructions(tx)) {
        if (ix['program'] !== 'system') continue;
        const parsed = rec(ix['parsed']);
        const type = str(parsed?.['type']);
        if (type !== 'transfer' && type !== 'transferWithSeed') continue;
        const info = rec(parsed?.['info']);
        if (str(info?.['destination']) !== wallet) continue;
        const from = str(info?.['source']);
        const lamports = num(info?.['lamports']);
        if (from && lamports > 0) edges.push({ from, sol: lamports / 1e9, ts });
      }
    }
    return edges;
  }

  /** Cheap clustering hint — first known funder per wallet (bounded). */
  async getFundingParents(wallets: string[]): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    for (const w of wallets.slice(0, 12)) {
      const edges = await this.incomingTransfers(w, 6);
      out[w] = [...new Set(edges.map((e) => e.from))];
    }
    return out;
  }

  async getTokenLaunchStats(_mint: string): Promise<TokenLaunchStats | null> {
    return null; // mcap comes from the PriceProvider, not the chain
  }

  async getTokenDeployer(mint: string): Promise<{ wallet: string; createdAt: Date } | null> {
    // Walk to the oldest signature (the create), capped at 5 pages.
    let before: string | undefined;
    let oldest: RpcSig | null = null;
    for (let page = 0; page < 5; page++) {
      const sigs = await this.getSignatures(mint, 1000, before);
      if (sigs.length === 0) break;
      oldest = sigs[sigs.length - 1]!;
      if (sigs.length < 1000) break;
      before = oldest.signature;
    }
    if (!oldest) return null;
    const tx = await this.getTx(oldest.signature);
    const wallet = tx ? feePayer(tx) : null;
    if (!wallet) return null;
    return { wallet, createdAt: new Date((oldest.blockTime ?? 0) * 1000) };
  }

  private seenTreasury = new Set<string>();

  async getTreasuryTransfers(treasury: string): Promise<TreasuryTransfer[]> {
    // Only fetch full txs for signatures we haven't processed — steady
    // state costs ~1 RPC call per poll (no new payments → no getTx).
    const sigs = await this.getSignatures(treasury, 15);
    const out: TreasuryTransfer[] = [];
    for (const s of sigs) {
      if (this.seenTreasury.has(s.signature)) continue;
      this.seenTreasury.add(s.signature);
      const tx = await this.getTx(s.signature);
      if (!tx) continue;
      let amountSol = 0;
      let fromWallet = '';
      let memo: string | null = null;
      for (const ix of allInstructions(tx)) {
        const parsed = ix['parsed'];
        if (ix['program'] === 'system') {
          const p = rec(parsed);
          const info = rec(p?.['info']);
          if (str(p?.['type']) === 'transfer' && str(info?.['destination']) === treasury) {
            amountSol += num(info?.['lamports']) / 1e9;
            fromWallet = str(info?.['source']) ?? fromWallet;
          }
        }
        const isMemo = ix['program'] === 'spl-memo' || (str(ix['programId']) ?? '').startsWith('Memo');
        if (isMemo && typeof parsed === 'string') memo = parsed;
      }
      if (amountSol > 0 && fromWallet) {
        out.push({ signature: s.signature, fromWallet, amountSol, memo, ts: (s.blockTime ?? 0) * 1000 });
      }
    }
    if (this.seenTreasury.size > 2000) {
      this.seenTreasury = new Set([...this.seenTreasury].slice(-1000));
    }
    return out;
  }
}
