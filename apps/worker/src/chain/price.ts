import type { PriceProvider } from './types';

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
