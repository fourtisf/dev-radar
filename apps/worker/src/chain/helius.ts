import { setTimeout as sleep } from 'node:timers/promises';
import { env } from '../env';
import type { LaunchBuy } from '../engine/bundle';
import type { FundingEdge } from '../engine/funding';
import type { ChainClient, EnhancedTx, TokenLaunchStats, TreasuryTransfer } from './types';

const API_BASE = 'https://api.helius.xyz/v0';

/**
 * Thin Helius wrapper: rate-limited, retried with exponential backoff,
 * and entirely behind the ChainClient interface so the engine and jobs
 * never touch HTTP directly.
 *
 * ⚠ Endpoint shapes must be re-verified against current Helius docs
 * before production (handoff Section 5). Watch credit burn in week 1 —
 * narrow webhook filters before optimizing code.
 */
export class HeliusClient implements ChainClient {
  private lastCallAt = 0;

  constructor(
    private readonly apiKey: string = env.HELIUS_API_KEY,
    /** Minimum gap between calls (10 rps default). */
    private readonly minIntervalMs = 100,
    private readonly maxRetries = 4,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.apiKey) throw new Error('HELIUS_API_KEY is not configured');

    for (let attempt = 0; ; attempt++) {
      const wait = this.lastCallAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastCallAt = Date.now();

      const sep = path.includes('?') ? '&' : '?';
      const res = await fetch(`${API_BASE}${path}${sep}api-key=${this.apiKey}`, init);
      if (res.ok) return (await res.json()) as T;

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= this.maxRetries) {
        throw new Error(`Helius ${path} failed: ${res.status} ${await res.text()}`);
      }
      await sleep(2 ** attempt * 1000 + Math.random() * 250);
    }
  }

  async getWalletTransactions(wallet: string): Promise<EnhancedTx[]> {
    // Enhanced Transactions API, paged via `before`. Hard cap keeps a
    // pathological wallet from eating the credit budget.
    const out: EnhancedTx[] = [];
    let before: string | undefined;
    for (let page = 0; page < 20; page++) {
      const qs = before ? `?before=${before}&limit=100` : '?limit=100';
      const batch = await this.request<EnhancedTx[]>(`/addresses/${wallet}/transactions${qs}`);
      out.push(...batch);
      if (batch.length < 100) break;
      const last = batch[batch.length - 1];
      before = typeof last?.['signature'] === 'string' ? (last['signature'] as string) : undefined;
      if (!before) break;
    }
    return out.reverse(); // oldest first
  }

  async getLaunchBuys(mint: string, createdSlot: number): Promise<LaunchBuy[]> {
    // The mint's earliest enhanced transactions carry the launch buys:
    // each tokenTransfer that credits a wallet with this mint is a buy.
    // The create tx is the earliest slot → use it as the anchor when no
    // slot was captured upstream (PumpPortal omits slot).
    const txs = await this.request<EnhancedTx[]>(`/addresses/${mint}/transactions?limit=100`);
    txs.sort((a, b) => Number(a['slot'] ?? 0) - Number(b['slot'] ?? 0));
    const anchor =
      createdSlot && createdSlot > 0 ? createdSlot : Number(txs[0]?.['slot'] ?? 0);
    if (!anchor) return [];

    const buys: LaunchBuy[] = [];
    for (const tx of txs) {
      const offset = Number(tx['slot'] ?? 0) - anchor;
      if (offset < 0 || offset > 2) continue; // first ~2 slots (engine narrows further)
      const transfers = tx['tokenTransfers'];
      if (!Array.isArray(transfers)) continue;
      for (const t of transfers) {
        if (typeof t !== 'object' || t === null) continue;
        const r = t as Record<string, unknown>;
        if (r['mint'] !== mint) continue;
        const to = r['toUserAccount'];
        const amount = r['tokenAmount'];
        if (typeof to !== 'string' || typeof amount !== 'number' || amount <= 0) continue;
        buys.push({ wallet: to, tokens: amount, slotOffset: offset });
      }
    }
    return buys;
  }

  async getTokenSupply(_mint: string): Promise<number> {
    // pump.fun standard supply; per-token lookup via getAsset later.
    return 1_000_000_000;
  }

  async getIncomingSolTransfers(wallet: string): Promise<FundingEdge[]> {
    const txs = await this.request<EnhancedTx[]>(`/addresses/${wallet}/transactions?limit=100`);
    const edges: FundingEdge[] = [];
    for (const tx of txs) {
      const native = tx['nativeTransfers'];
      if (!Array.isArray(native)) continue;
      for (const t of native) {
        if (typeof t !== 'object' || t === null) continue;
        const r = t as Record<string, unknown>;
        if (r['toUserAccount'] !== wallet) continue;
        const from = r['fromUserAccount'];
        const lamports = r['amount'];
        if (typeof from !== 'string' || typeof lamports !== 'number') continue;
        edges.push({
          from,
          sol: lamports / 1_000_000_000,
          ts: typeof tx['timestamp'] === 'number' ? (tx['timestamp'] as number) * 1000 : 0,
        });
      }
    }
    return edges;
  }

  async getFundingParents(wallets: string[]): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    for (const w of wallets) {
      const edges = await this.getIncomingSolTransfers(w);
      out[w] = [...new Set(edges.map((e) => e.from))];
    }
    return out;
  }

  async getTokenLaunchStats(_mint: string): Promise<TokenLaunchStats | null> {
    // TODO(verify): needs a price source (DAS / DEX API). Returning
    // null means backfilled history can only resolve via age rules.
    return null;
  }

  async getTokenDeployer(mint: string): Promise<{ wallet: string; createdAt: Date } | null> {
    // The mint's first transaction is its create; feePayer = deployer.
    const txs = await this.request<EnhancedTx[]>(`/addresses/${mint}/transactions?limit=100`);
    const first = txs[txs.length - 1]; // API returns newest first
    if (!first || typeof first['feePayer'] !== 'string') return null;
    const ts = typeof first['timestamp'] === 'number' ? (first['timestamp'] as number) : 0;
    return { wallet: first['feePayer'] as string, createdAt: new Date(ts * 1000) };
  }

  async getTreasuryTransfers(treasury: string): Promise<TreasuryTransfer[]> {
    const txs = await this.request<EnhancedTx[]>(`/addresses/${treasury}/transactions?limit=50`);
    const out: TreasuryTransfer[] = [];
    for (const tx of txs) {
      const native = tx['nativeTransfers'];
      if (!Array.isArray(native)) continue;
      let amountSol = 0;
      let fromWallet = '';
      for (const t of native) {
        if (typeof t !== 'object' || t === null) continue;
        const r = t as Record<string, unknown>;
        if (r['toUserAccount'] !== treasury) continue;
        if (typeof r['amount'] === 'number') {
          amountSol += (r['amount'] as number) / 1_000_000_000;
          if (typeof r['fromUserAccount'] === 'string') fromWallet = r['fromUserAccount'];
        }
      }
      if (amountSol <= 0 || !fromWallet) continue;

      // Memo program text rides on the enhanced tx — check both the
      // dedicated field and instruction parsing. TODO(verify) exact shape.
      let memo: string | null = null;
      const instructions = tx['instructions'];
      if (Array.isArray(instructions)) {
        for (const ix of instructions) {
          if (typeof ix !== 'object' || ix === null) continue;
          const r = ix as Record<string, unknown>;
          const pid = r['programId'];
          if (
            typeof pid === 'string' &&
            pid.startsWith('Memo') &&
            typeof r['data'] === 'string'
          ) {
            memo = r['data'] as string;
          }
        }
      }

      out.push({
        signature: typeof tx['signature'] === 'string' ? (tx['signature'] as string) : '',
        fromWallet,
        amountSol,
        memo,
        ts: typeof tx['timestamp'] === 'number' ? (tx['timestamp'] as number) * 1000 : 0,
      });
    }
    return out;
  }
}
