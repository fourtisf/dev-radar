import { ENGINE } from './config';
import type { LaunchBuy } from './bundle';
import type { SnipeLvl } from './types';

/** Handoff 7.5 — first-2-slot buyer count, excluding the dev cluster. */
export function countSnipers(
  buys: LaunchBuy[],
  deployer: string,
  clusterWallets: string[],
  cfg = ENGINE.bundle,
): number {
  const cluster = new Set([deployer, ...clusterWallets]);
  const counted = new Set<string>();
  for (const b of buys) {
    if (b.slotOffset >= cfg.launchSlots) continue;
    if (cluster.has(b.wallet)) continue;
    counted.add(b.wallet);
  }
  return counted.size;
}

/** <5 LOW · 5–14 MED · ≥15 HIGH. */
export function sniperLevel(sniperCount: number, cfg = ENGINE.snipers): SnipeLvl {
  if (sniperCount >= cfg.highMin) return 'HIGH';
  if (sniperCount >= cfg.medMin) return 'MED';
  return 'LOW';
}
