'use client';

import {
  dossierFileNo,
  fmtDuration,
  fmtUsd,
  scoreClass,
  shortAddr,
  timeAgo,
  VERDICT_LABEL,
  verdictClass,
  OUTCOME_CLASS,
} from '@/lib/client/format';
import { fundingSegments } from '@/lib/client/funding';
import type { DossierDto, TokenDto } from '@/lib/client/types';

export type DossierState =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'tracing'; query: string }
  | { status: 'notfound'; query: string }
  | { status: 'quota'; used: number; limit: number }
  | {
      status: 'ready';
      dossier: DossierDto;
      /** The launch that opened this dossier (clicked feed row). */
      token: TokenDto | null;
      traceMs: number;
    };

interface DossierPanelProps {
  state: DossierState;
  sweeping: boolean;
  followed: boolean;
  onFollow: (wallet: string) => void;
  onAlert: () => void;
  onCopy: (label: string, value: string) => void;
  onChart: (mint: string, symbol: string) => void;
  onUpgrade: () => void;
}

/** Right-panel dossier — ports the prototype's dossierHTML 1:1. */
export function DossierPanel(props: DossierPanelProps): JSX.Element {
  const { state, sweeping } = props;

  return (
    <div className={`t-dossier${sweeping || state.status === 'tracing' ? ' tracing' : ''}`}>
      <span className="scanline" aria-hidden="true" />
      <div className="d-content">
        <Content {...props} />
      </div>
    </div>
  );
}

function Content({
  state,
  followed,
  onFollow,
  onAlert,
  onCopy,
  onChart,
  onUpgrade,
}: DossierPanelProps): JSX.Element {
  switch (state.status) {
    case 'empty':
      return (
        <div className="empty">
          <div className="ic">◎</div>
          <p>Select a deploy from the live feed — or trace any CA or wallet above.</p>
          <div className="mono-hint">Press / to focus trace</div>
        </div>
      );
    case 'loading':
      return (
        <div className="empty">
          <div className="ic">◎</div>
          <p>Compiling dossier…</p>
        </div>
      );
    case 'tracing':
      return (
        <div className="empty">
          <div className="ic">◎</div>
          <p>
            Re-tracing <span style={{ color: 'var(--gold)' }}>{shortAddr(state.query)}</span> —
            walking wallet history on-chain.
          </p>
          <div className="mono-hint">Cold trace · usually under 10s</div>
        </div>
      );
    case 'notfound':
      return (
        <div className="empty">
          <div className="ic">◌</div>
          <p>
            Nothing resolvable behind{' '}
            <span style={{ color: 'var(--gold)' }}>{shortAddr(state.query)}</span>. Check the
            address and try again.
          </p>
        </div>
      );
    case 'quota':
      return (
        <div className="empty">
          <div className="ic">◉</div>
          <p>
            Scout limit reached — {state.limit} dossiers per day. Operator unlocks unlimited
            traces in real time.
          </p>
          <button className="btn btn-gold btn-sm" style={{ marginTop: 18 }} onClick={onUpgrade}>
            Go Operator
          </button>
        </div>
      );
    case 'ready': {
      const { dossier, token, traceMs } = state;
      const dev = dossier.dev;
      const current = token ?? dossier.tokens[0] ?? null;
      const score = current?.drScore ?? dossier.drScore;
      const bundle = current ? current.bundlePct : 0;
      const snipers = current?.sniperLvl ?? 'LOW';
      const rugCls = dev.verdict === 'WINNER' ? 'good' : dev.verdict === 'RUGGER' ? 'bad' : '';
      const history = dossier.tokens.filter((t) => t.mint !== current?.mint).slice(0, 6);

      return (
        <>
          <div className="d-file">
            <span className="t">Dossier · {dossierFileNo(dev.wallet)}</span>
            <span className="d-score">
              <span className={`n score ${scoreClass(score)}`}>{score}</span>
              <span className="l">DR Score</span>
            </span>
          </div>
          <div className="d-id">
            <div>
              <div className="d-wallet">
                {shortAddr(dev.wallet)}{' '}
                <span
                  className="cp"
                  title="Copy CA"
                  onClick={() => current && onCopy('CA', current.mint)}
                >
                  ⧉
                </span>
              </div>
              <div className="d-sub">
                First seen {timeAgo(dev.firstSeenAt)} · pump.fun native
                {dev.backfilled ? '' : ' · history compiling…'}
              </div>
            </div>
            <span className={`verdict ${verdictClass(dev.verdict)}`}>
              <span className="vd" />
              {VERDICT_LABEL[dev.verdict] ?? dev.verdict}
            </span>
          </div>
          {current ? (
            <div className="d-token">
              <span>
                <span className="tk">${current.symbol}</span> &nbsp;
                <span className="nm">{current.name}</span>
              </span>
              <span className="open" onClick={() => onChart(current.mint, current.symbol)}>
                Chart ↗
              </span>
            </div>
          ) : null}
          <div className="d-stats">
            <div className="ds">
              <div className="k">Launches</div>
              <div className="v">{dev.launchCount}</div>
            </div>
            <div className="ds">
              <div className="k">Rug rate</div>
              <div className={`v ${rugCls}`}>
                {dev.rugRatePct === null ? '—' : `${dev.rugRatePct}%`}
              </div>
            </div>
            <div className="ds">
              <div className="k">Best ATH</div>
              <div className="v">{fmtUsd(dev.bestAthUsd)}</div>
            </div>
            <div className="ds">
              <div className="k">Lifespan</div>
              <div className="v">{fmtDuration(dev.medianLifespanS)}</div>
            </div>
          </div>
          <div className="d-risk">
            <div className="dr">
              <span className="k">Bundle</span>
              <span className={`v ${bundle >= 18 ? 'bad' : bundle >= 10 ? 'warn' : 'ok'}`}>
                {bundle}%
              </span>
            </div>
            <div className="dr">
              <span className="k">Snipers</span>
              <span className={`v ${snipers === 'HIGH' ? 'bad' : snipers === 'MED' ? 'warn' : 'ok'}`}>
                {snipers}
              </span>
            </div>
          </div>
          <div className="d-fund">
            <span className="k">FUNDING</span> →{' '}
            {fundingSegments(dev).map((seg, i) =>
              seg.gold ? (
                <span key={i} className="a">
                  {seg.text}
                </span>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </div>
          <div className="d-ph">Launch history</div>
          <div>
            {current ? (
              <div className="prior">
                <span className="t">${current.symbol}</span>
                <span className="m">
                  {current.peakMcapUsd > 0
                    ? `peak ${fmtUsd(current.peakMcapUsd)}`
                    : `deployed ${timeAgo(current.createdAt)}`}
                </span>
                <span className={`o ${OUTCOME_CLASS[current.outcome] ?? ''}`}>
                  {current.outcome}
                </span>
              </div>
            ) : null}
            {history.map((t) => (
              <div className="prior" key={t.mint}>
                <span className="t">${t.symbol}</span>
                <span className="m">
                  {t.peakMcapUsd > 0 ? `peak ${fmtUsd(t.peakMcapUsd)}` : timeAgo(t.createdAt)}
                </span>
                <span className={`o ${OUTCOME_CLASS[t.outcome] ?? ''}`}>{t.outcome}</span>
              </div>
            ))}
            {dossier.tokens.length === 0 ? (
              <div className="prior">
                <span className="t">No prior launches</span>
                <span className="m">first deploy from this wallet</span>
                <span className="o live">NEW</span>
              </div>
            ) : null}
          </div>
          <div className="d-actions">
            <button
              className={`btn ${followed ? 'btn-line' : 'btn-gold'}`}
              onClick={() => onFollow(dev.wallet)}
            >
              {followed ? 'Following ✓' : 'Follow dev'}
            </button>
            <button className="btn btn-line" onClick={onAlert}>
              Set alert
            </button>
          </div>
          <div className="d-conf">
            <span>
              Trace <b>{(traceMs / 1000).toFixed(1)}s</b>
            </span>
            <span>
              Confidence <b>{dev.confidence}%</b>
            </span>
          </div>
        </>
      );
    }
  }
}
