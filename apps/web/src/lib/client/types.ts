/** Client mirrors of the API wire formats (see README-api.md). */
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
  fundingPath: { wallet: string; label: string | null; hop: number; sol: number; ts: number }[] | null;
  flagged: boolean;
  backfilled: boolean;
  rugRatePct: number | null;
}

export interface DossierDto {
  dev: DevDto;
  drScore: number;
  tokens: TokenDto[];
}

export interface FeedRow {
  token: TokenDto;
  dev: DevDto;
}

export interface MeDto {
  authenticated: boolean;
  id?: string;
  wallet?: string;
  tier: 'SCOUT' | 'OPERATOR' | 'SYNDICATE';
  tierExpires?: string | null;
  telegramLinked?: boolean;
}

/** Deploy event over SSE (compact NOTIFY snapshot, not full DTOs). */
export interface DeployEvent {
  type: 'deploy';
  token: Pick<
    TokenDto,
    'mint' | 'symbol' | 'name' | 'venue' | 'createdAt' | 'bundlePct' | 'sniperLvl' | 'drScore'
  >;
  dev: Pick<
    DevDto,
    'wallet' | 'verdict' | 'confidence' | 'launchCount' | 'rugCount' | 'bestAthUsd' | 'flagged'
  >;
}

export interface DossierUpdateEvent {
  type: 'dossier-update';
  wallet: string;
  verdict: string;
  drScore: number;
  mint?: string;
  bundlePct?: number;
  sniperLvl?: string;
}
