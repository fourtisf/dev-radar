import type { DossierDto } from '@/lib/client/types';
import {
  dossierFileNo,
  fmtDuration,
  fmtUsd,
  shortAddr,
  timeAgo,
  VERDICT_LABEL,
  verdictClass,
  OUTCOME_CLASS,
} from '@/lib/client/format';
import { fundingSegments, type FundSegment } from '@/lib/client/funding';

/** Hero dossier card data (shape mirrors the prototype's LP array). */
export interface LpProfile {
  file: string;
  wallet: string;
  sub: string;
  verdict: { t: string; cls: 'win' | 'rug' | 'fresh' };
  launch: string;
  rug: { v: string; cls: '' | 'good' | 'bad' };
  ath: string;
  life: string;
  fund: FundSegment[];
  priors: { t: string; m: string; o: string; cls: string }[];
  time: string;
  conf: string;
}

/** The prototype's three static hero profiles — build/DB-down fallback. */
export const STATIC_PROFILES: LpProfile[] = [
  {
    file: 'Dossier · DR-2026-184302',
    wallet: '7xKp····9fQm',
    sub: 'First seen 14 months ago · pump.fun native',
    verdict: { t: 'Serial Winner', cls: 'win' },
    launch: '14',
    rug: { v: '0%', cls: 'good' },
    ath: '$4.2M',
    life: '11d',
    fund: [
      { text: 'Binance 8', gold: true },
      { text: ' hot wallet · 3d before first deploy · no mixer pattern' },
    ],
    priors: [
      { t: '$CATGPT', m: 'peak $4.2M', o: 'CLEAN', cls: 'win' },
      { t: '$SOLPET', m: 'peak $860K', o: 'CLEAN', cls: 'win' },
      { t: '$NORTH', m: 'peak $1.2M', o: 'LIVE', cls: 'live' },
    ],
    time: '1.8s',
    conf: '98%',
  },
  {
    file: 'Dossier · DR-2026-091774',
    wallet: 'Dk3r····x2Vn',
    sub: 'First seen 2 months ago · cluster of 7 wallets',
    verdict: { t: 'Serial Rugger', cls: 'rug' },
    launch: '31',
    rug: { v: '87%', cls: 'bad' },
    ath: '$310K',
    life: '41m',
    fund: [
      { text: 'fresh wallet chain · ' },
      { text: '3 hops', gold: true },
      { text: ' from flagged rugger Dk0f····m2Ce' },
    ],
    priors: [
      { t: '$ELONAI', m: 'peak $310K', o: 'RUG', cls: 'rug' },
      { t: '$PEPE2', m: 'peak $95K', o: 'RUG', cls: 'rug' },
      { t: '$SAFEMOON', m: 'peak $44K', o: 'RUG', cls: 'rug' },
    ],
    time: '1.6s',
    conf: '99%',
  },
  {
    file: 'Dossier · DR-2026-201118',
    wallet: '9mTw····k4Lp',
    sub: 'First seen 2 hours ago · no prior deploys',
    verdict: { t: 'Fresh Wallet', cls: 'fresh' },
    launch: '1',
    rug: { v: '—', cls: '' },
    ath: '—',
    life: '—',
    fund: [
      { text: 'instant-swap inflow ' },
      { text: '2h ago', gold: true },
      { text: ' · origin unverified · unproven' },
    ],
    priors: [{ t: '$MOONCAT', m: 'deployed 4m ago', o: 'LIVE', cls: 'live' }],
    time: '1.7s',
    conf: '91%',
  },
];

/** Maps a real dossier to the hero-card shape. */
export function profileFromDossier(d: DossierDto): LpProfile {
  const dev = d.dev;
  return {
    file: `Dossier · ${dossierFileNo(dev.wallet)}`,
    wallet: shortAddr(dev.wallet),
    sub: `First seen ${timeAgo(dev.firstSeenAt)} · pump.fun native`,
    verdict: { t: VERDICT_LABEL[dev.verdict] ?? dev.verdict, cls: verdictClass(dev.verdict) },
    launch: String(dev.launchCount),
    rug: {
      v: dev.rugRatePct === null ? '—' : `${dev.rugRatePct}%`,
      cls: dev.rugRatePct === null ? '' : dev.rugRatePct <= 10 ? 'good' : 'bad',
    },
    ath: fmtUsd(dev.bestAthUsd),
    life: fmtDuration(dev.medianLifespanS),
    fund: fundingSegments(dev),
    priors: d.tokens.slice(0, 3).map((t) => ({
      t: `$${t.symbol}`,
      m: t.peakMcapUsd > 0 ? `peak ${fmtUsd(t.peakMcapUsd)}` : `deployed ${timeAgo(t.createdAt)}`,
      o: t.outcome,
      cls: OUTCOME_CLASS[t.outcome] ?? '',
    })),
    time: '1.8s',
    conf: `${dev.confidence}%`,
  };
}
