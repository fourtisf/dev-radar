/**
 * Engine-local string unions. These mirror the Prisma enums in
 * packages/db but keep the engine pure — no runtime dependency on the
 * generated client, so every function in src/engine is unit-testable
 * in isolation.
 */
export type Verdict = 'WINNER' | 'RUGGER' | 'FRESH' | 'NEUTRAL';
export type Outcome = 'LIVE' | 'CLEAN' | 'RUG' | 'DEAD';
export type FundType = 'CEX_CLEAN' | 'UNVERIFIED' | 'MIXER' | 'LINKED_FLAGGED';
export type SnipeLvl = 'LOW' | 'MED' | 'HIGH';

/** One hop in a persisted funding path (Dev.fundingPath JSON). */
export interface FundingHop {
  wallet: string;
  label: string | null;
  hop: number;
  sol: number;
  ts: number;
}

export const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));
