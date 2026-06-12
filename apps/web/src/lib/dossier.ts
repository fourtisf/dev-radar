import type { Dev, Token } from '@devradar/db';

/** Wire format for dossiers and feed rows (README-api.md documents it). */
export interface TokenDto {
  mint: string;
  symbol: string;
  name: string;
  venue: string;
  createdAt: string;
  bundlePct: number;
  sniperLvl: string;
  drScore: number;
  outcome: string;
  peakMcapUsd: number;
  lifespanS: number;
}

export interface FundingHopDto {
  wallet: string;
  label: string | null;
  hop: number;
  sol: number;
  ts: number;
}

export interface DevDto {
  wallet: string;
  firstSeenAt: string;
  verdict: string;
  confidence: number;
  launchCount: number;
  rugCount: number;
  cleanCount: number;
  bestAthUsd: number;
  medianLifespanS: number;
  fundingType: string;
  fundingPath: FundingHopDto[] | null;
  flagged: boolean;
  backfilled: boolean;
  rugRatePct: number | null;
}

export interface DossierDto {
  dev: DevDto;
  drScore: number;
  tokens: TokenDto[];
}

export function tokenDto(t: Token): TokenDto {
  return {
    mint: t.mint,
    symbol: t.symbol,
    name: t.name,
    venue: t.venue,
    createdAt: t.createdAt.toISOString(),
    bundlePct: Number(t.bundlePct),
    sniperLvl: t.sniperLvl,
    drScore: t.drScore,
    outcome: t.outcome,
    peakMcapUsd: Number(t.peakMcapUsd),
    lifespanS: t.lifespanS,
  };
}

export function devDto(d: Dev): DevDto {
  return {
    wallet: d.wallet,
    firstSeenAt: d.firstSeenAt.toISOString(),
    verdict: d.verdict,
    confidence: d.confidence,
    launchCount: d.launchCount,
    rugCount: d.rugCount,
    cleanCount: d.cleanCount,
    bestAthUsd: Number(d.bestAthUsd),
    medianLifespanS: d.medianLifespanS,
    fundingType: d.fundingType,
    // Persisted by the worker's funding trace as [{wallet,label,hop,sol,ts}]
    fundingPath: Array.isArray(d.fundingPath)
      ? (d.fundingPath as unknown as FundingHopDto[])
      : null,
    flagged: d.flagged,
    backfilled: d.backfilledAt !== null,
    rugRatePct:
      d.launchCount > 0 ? Math.round((d.rugCount / d.launchCount) * 100) : null,
  };
}

/** Dossier = dev + recent launches; DR Score rides on the latest token. */
export function dossierDto(dev: Dev, tokens: Token[]): DossierDto {
  return {
    dev: devDto(dev),
    drScore: tokens[0]?.drScore ?? 50,
    tokens: tokens.map(tokenDto),
  };
}
