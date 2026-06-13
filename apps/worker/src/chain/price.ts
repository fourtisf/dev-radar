import type { PriceProvider } from './types';

type Quote = { mcapUsd: number; liqUsd: number };

/** Fetch JSON with a hard timeout; any failure → null (never throws). */
async function fetchJson(url: string, ms = 6000): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: 'application/json', 'user-agent': 'DevRadar/1.0' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * pump.fun frontend API — covers the bonding-curve phase (before a
 * token graduates to Raydium). Unofficial endpoint; shape may change,
 * so every miss returns null and the next source is tried.
 */
export class PumpFunPriceProvider implements PriceProvider {
  async getMcapAndLiq(mint: string): Promise<Quote | null> {
    const data = await fetchJson(`https://frontend-api.pump.fun/coins/${mint}`);
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const mcap = typeof d['usd_market_cap'] === 'number' ? (d['usd_market_cap'] as number) : null;
    if (mcap === null || mcap <= 0) return null;
    // SOL reserve in the bonding curve as a rough liquidity proxy
    // (snapshot-only field; never feeds the rug/clean decision).
    const solRes =
      typeof d['virtual_sol_reserves'] === 'number' ? (d['virtual_sol_reserves'] as number) / 1e9 : 0;
    return { mcapUsd: mcap, liqUsd: Math.round(solRes * 150) };
  }
}

/**
 * DexScreener — covers graduated tokens trading on Raydium/others.
 * Picks the deepest pair. Public API, no key.
 */
export class DexScreenerPriceProvider implements PriceProvider {
  async getMcapAndLiq(mint: string): Promise<Quote | null> {
    const data = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!data || typeof data !== 'object') return null;
    const pairs = (data as Record<string, unknown>)['pairs'];
    if (!Array.isArray(pairs) || pairs.length === 0) return null;

    let best: Record<string, unknown> | null = null;
    let bestLiq = -1;
    for (const p of pairs) {
      if (typeof p !== 'object' || p === null) continue;
      const r = p as Record<string, unknown>;
      const liqUsd = (r['liquidity'] as Record<string, unknown> | undefined)?.['usd'];
      const l = typeof liqUsd === 'number' ? liqUsd : 0;
      if (l > bestLiq) {
        bestLiq = l;
        best = r;
      }
    }
    if (!best) return null;

    const mcap =
      typeof best['marketCap'] === 'number'
        ? (best['marketCap'] as number)
        : typeof best['fdv'] === 'number'
          ? (best['fdv'] as number)
          : null;
    if (mcap === null || mcap <= 0) return null;
    return { mcapUsd: mcap, liqUsd: Math.max(0, Math.round(bestLiq)) };
  }
}

/**
 * Production price source: pump.fun first (bonding curve), DexScreener
 * second (graduated). Fail-open — if every source misses, returns null
 * and the outcome engine falls back to age-based resolution, so a bad
 * upstream response can never corrupt a verdict.
 */
export class LivePriceProvider implements PriceProvider {
  private readonly sources: PriceProvider[] = [
    new PumpFunPriceProvider(),
    new DexScreenerPriceProvider(),
  ];

  async getMcapAndLiq(mint: string): Promise<Quote | null> {
    for (const source of this.sources) {
      const quote = await source.getMcapAndLiq(mint);
      if (quote && quote.mcapUsd > 0) return quote;
    }
    return null;
  }
}

/**
 * Stub PriceProvider (Prompt 3): deterministic pseudo-random walk
 * keyed on the mint so local dev sees tokens pump, dump and resolve.
 * Swap for a real market-data implementation behind the same
 * interface — nothing else changes.
 */
export class StubPriceProvider implements PriceProvider {
  async getMcapAndLiq(mint: string): Promise<{ mcapUsd: number; liqUsd: number } | null> {
    let h = 2166136261;
    for (let i = 0; i < mint.length; i++) {
      h ^= mint.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const seed = (h >>> 0) / 0xffffffff; // 0..1, stable per mint
    const minutes = Math.floor(Date.now() / 60_000);
    const phase = (minutes % 360) / 360;
    // Base size: a few k to a few hundred k, drifting over time.
    const base = 4_000 + seed * 250_000;
    const wave = 0.5 + 0.5 * Math.sin((phase + seed) * Math.PI * 2);
    const mcapUsd = Math.round(base * (0.2 + 1.6 * wave));
    return { mcapUsd, liqUsd: Math.round(mcapUsd * 0.18) };
  }
}

/** A PriceProvider that always misses — useful in tests. */
export class NullPriceProvider implements PriceProvider {
  async getMcapAndLiq(): Promise<null> {
    return null;
  }
}
