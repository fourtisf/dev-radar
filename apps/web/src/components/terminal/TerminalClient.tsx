'use client';

/**
 * Terminal view — 1:1 port of #view-terminal from
 * reference/devradar-site.html, wired to the real API: /api/feed +
 * SSE, /api/dev/:wallet dossiers (202 cold-trace polling), /api/trace,
 * watchlist + leaderboard, SIWS wallet connect, tier badge.
 */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clockTime,
  rowTime,
  scoreClass,
  shortAddr,
  timeAgo,
  VERDICT_LABEL,
  VERDICT_SHORT,
  verdictClass,
} from '@/lib/client/format';
import { ToastProvider, useToast } from '@/lib/client/toast';
import type { DossierDto, FeedRow, TokenDto } from '@/lib/client/types';
import { useLiveFeed } from '@/lib/client/useLiveFeed';
import { useMe } from '@/lib/client/useMe';
import { signInWithSolana, WalletError } from '@/lib/client/wallet';
import { PayModal } from '@/components/PayModal';
import { TelegramLinkModal } from '@/components/TelegramLinkModal';
import { DossierPanel, type DossierState } from './DossierPanel';

const FILTER_MAP: Record<string, string> = { win: 'WINNER', rug: 'RUGGER', fresh: 'FRESH' };
const TIER_BADGE: Record<string, string> = {
  SCOUT: 'Scout',
  OPERATOR: 'Operator',
  SYNDICATE: 'Syndicate',
};

interface WatchRow {
  wallet: string;
  dev: { verdict: string } | null;
  lastLaunch: { mint: string; symbol: string; createdAt: string } | null;
}

interface LeaderRow {
  dev: {
    wallet: string;
    verdict: string;
    launchCount: number;
    bestAthUsd: number;
    rugRatePct: number | null;
  };
  drScore: number;
}

export function TerminalClient(): JSX.Element {
  return (
    <ToastProvider>
      <Terminal />
    </ToastProvider>
  );
}

function Terminal(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { me, refresh: refreshMe } = useMe();

  const [filter, setFilter] = useState('all');
  const [paused, setPaused] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [tab, setTab] = useState<'dossier' | 'watch' | 'top'>('dossier');
  const [stats, setStats] = useState({ dep: 0, win: 0, rug: 0 });
  const [clock, setClock] = useState('--:--:--');
  const [activeMint, setActiveMint] = useState<string | null>(null);
  const [dossier, setDossier] = useState<DossierState>({ status: 'empty' });
  const [sweeping, setSweeping] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchRow[]>([]);
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [traceQuery, setTraceQuery] = useState('');
  const [payTier, setPayTier] = useState<'OPERATOR' | 'SYNDICATE' | null>(null);
  const [tgModal, setTgModal] = useState(false);

  const audioCtx = useRef<AudioContext | null>(null);
  const traceInput = useRef<HTMLInputElement>(null);
  const dossierCache = useRef(new Map<string, DossierDto>());
  const pollAbort = useRef(0);
  const soundOnRef = useRef(false);
  const reducedMotion = useRef(false);

  // body.app drives the prototype's terminal-mode CSS (overflow, nav).
  useEffect(() => {
    document.body.classList.add('app');
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return () => document.body.classList.remove('app');
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(clockTime()), 1000);
    setClock(clockTime());
    return () => clearInterval(id);
  }, []);

  const blip = useCallback((): void => {
    const ctx = audioCtx.current;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 920;
    g.gain.setValueAtTime(0.05, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.2);
  }, []);

  const onAdded = useCallback(
    (row: FeedRow, live: boolean): void => {
      setStats((s) => ({
        dep: s.dep + 1,
        win: s.win + (row.dev.verdict === 'WINNER' ? 1 : 0),
        rug: s.rug + (row.dev.verdict === 'RUGGER' ? 1 : 0),
      }));
      if (live && row.dev.verdict === 'WINNER') {
        toast('w', `PROVEN DEPLOYER LIVE · <b>$${row.token.symbol}</b>`);
        if (soundOnRef.current) blip();
      }
    },
    [toast, blip],
  );

  const onDossierUpdate = useCallback((e: { wallet: string; verdict: string; drScore: number }) => {
    dossierCache.current.delete(e.wallet); // stale — refetch on next open
    setDossier((d) => {
      if (d.status !== 'ready' || d.dossier.dev.wallet !== e.wallet) return d;
      return {
        ...d,
        dossier: { ...d.dossier, drScore: e.drScore, dev: { ...d.dossier.dev, verdict: e.verdict } },
      };
    });
  }, []);

  const feed = useLiveFeed({ max: 60, paused, onAdded, onDossierUpdate });

  // ── Dossier opening (scan-sweep + 202 polling) ────────────────
  const sweepThen = useCallback((apply: () => void): void => {
    if (reducedMotion.current) {
      apply();
      return;
    }
    setSweeping(true);
    setTimeout(apply, 380);
    setTimeout(() => setSweeping(false), 920);
  }, []);

  const fetchDossier = useCallback(
    async (wallet: string, token: TokenDto | null): Promise<void> => {
      const myPoll = ++pollAbort.current;
      setTab('dossier');

      const cached = dossierCache.current.get(wallet);
      if (cached) {
        sweepThen(() => setDossier({ status: 'ready', dossier: cached, token, traceMs: 120 }));
        return;
      }

      setDossier({ status: 'loading' });
      const started = performance.now();

      for (let attempt = 0; attempt < 14; attempt++) {
        if (pollAbort.current !== myPoll) return; // superseded
        let res: Response;
        try {
          res = await fetch(`/api/dev/${wallet}`);
        } catch {
          setDossier({ status: 'notfound', query: wallet });
          return;
        }

        if (res.status === 202) {
          setDossier({ status: 'tracing', query: wallet });
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }
        if (res.status === 429) {
          const body = (await res.json()) as { used?: number; limit?: number };
          setDossier({ status: 'quota', used: body.used ?? 10, limit: body.limit ?? 10 });
          return;
        }
        if (!res.ok) {
          setDossier({ status: 'notfound', query: wallet });
          return;
        }
        const data = (await res.json()) as DossierDto;
        dossierCache.current.set(wallet, data);
        const traceMs = performance.now() - started;
        sweepThen(() => setDossier({ status: 'ready', dossier: data, token, traceMs }));
        return;
      }
      setDossier({ status: 'notfound', query: wallet });
    },
    [sweepThen],
  );

  const selectRow = useCallback(
    (row: FeedRow): void => {
      setActiveMint(row.token.mint);
      void fetchDossier(row.dev.wallet, row.token);
    },
    [fetchDossier],
  );

  // ── Trace bar (Enter / button / ?trace= / ?dev=) ──────────────
  const runTrace = useCallback(
    async (raw?: string): Promise<void> => {
      const q = (raw ?? traceInput.current?.value ?? '').trim();
      if (!q) return;
      if (traceInput.current) traceInput.current.value = '';
      toast('g', `Tracing <b>${q.slice(0, 14)}…</b>`);
      setTab('dossier');
      setDossier({ status: 'loading' });
      const myPoll = ++pollAbort.current;
      const started = performance.now();

      for (let attempt = 0; attempt < 14; attempt++) {
        if (pollAbort.current !== myPoll) return;
        let res: Response;
        try {
          res = await fetch('/api/trace', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ q }),
          });
        } catch {
          setDossier({ status: 'notfound', query: q });
          return;
        }

        if (res.status === 202) {
          setDossier({ status: 'tracing', query: q });
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }
        if (res.status === 404) {
          setDossier({ status: 'notfound', query: q });
          return;
        }
        if (res.status === 429) {
          const body = (await res.json()) as { used?: number; limit?: number; error?: string };
          if (body.error === 'dossier_quota') {
            setDossier({ status: 'quota', used: body.used ?? 10, limit: body.limit ?? 10 });
          } else {
            toast('r', 'Rate limited — slow down');
            setDossier({ status: 'empty' });
          }
          return;
        }
        if (!res.ok) {
          toast('r', 'Trace failed — check the address');
          setDossier({ status: 'empty' });
          return;
        }
        const data = (await res.json()) as { dossier: DossierDto };
        const dossierData = data.dossier;
        dossierCache.current.set(dossierData.dev.wallet, dossierData);
        const traceMs = performance.now() - started;
        sweepThen(() =>
          setDossier({
            status: 'ready',
            dossier: dossierData,
            token: dossierData.tokens[0] ?? null,
            traceMs,
          }),
        );
        return;
      }
      setDossier({ status: 'notfound', query: q });
    },
    [sweepThen, toast],
  );

  // Deep links: /app?trace=<q> from the hero scanbar, /app?dev=<wallet> from TG.
  const bootParam = useRef(false);
  useEffect(() => {
    if (bootParam.current) return;
    bootParam.current = true;
    const q = searchParams.get('trace');
    const dev = searchParams.get('dev');
    if (q) void runTrace(q);
    else if (dev) void fetchDossier(dev, null);
  }, [searchParams, runTrace, fetchDossier]);

  // ── Keyboard: "/" focuses trace, Esc exits to the landing ─────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === '/' && document.activeElement !== traceInput.current) {
        e.preventDefault();
        traceInput.current?.focus();
      }
      if (e.key === 'Escape') router.push('/');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [router]);

  // ── Watchlist (API-backed for logged-in users) ────────────────
  const loadWatchlist = useCallback(async (): Promise<void> => {
    if (!me.authenticated) {
      setWatchlist([]);
      return;
    }
    const res = await fetch('/api/watchlist');
    if (!res.ok) return;
    const data = (await res.json()) as { rows: WatchRow[] };
    setWatchlist(data.rows);
  }, [me.authenticated]);

  useEffect(() => {
    void loadWatchlist();
  }, [loadWatchlist]);

  const followedSet = useMemo(() => new Set(watchlist.map((w) => w.wallet)), [watchlist]);

  const toggleFollow = useCallback(
    async (wallet: string): Promise<void> => {
      if (!me.authenticated) {
        toast('g', 'Connect your wallet to follow devs');
        return;
      }
      if (followedSet.has(wallet)) {
        await fetch(`/api/watchlist?devWallet=${wallet}`, { method: 'DELETE' });
        toast('g', `Unfollowed <b>${shortAddr(wallet)}</b>`);
      } else {
        await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ devWallet: wallet }),
        });
        toast('g', `Following <b>${shortAddr(wallet)}</b> — pinged on deploy`);
      }
      void loadWatchlist();
    },
    [me.authenticated, followedSet, toast, loadWatchlist],
  );

  // ── Leaderboard ───────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'top' || leaders.length > 0) return;
    void fetch('/api/leaderboard?type=winners')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { rows: LeaderRow[] } | null) => {
        if (data) setLeaders(data.rows);
      });
  }, [tab, leaders.length]);

  // ── Misc actions ──────────────────────────────────────────────
  const copy = useCallback(
    (label: string, value: string): void => {
      void navigator.clipboard?.writeText(value).catch(() => undefined);
      toast('g', `${label} copied · <b>${shortAddr(value)}</b>`);
    },
    [toast],
  );

  const openChart = useCallback(
    (mint: string, symbol: string): void => {
      toast('g', `<b>$${symbol}</b> · opening chart`);
      window.open(`https://pump.fun/${mint}`, '_blank', 'noopener');
    },
    [toast],
  );

  const connect = useCallback(async (): Promise<void> => {
    try {
      const res = await signInWithSolana();
      await refreshMe();
      toast('w', `Connected <b>${shortAddr(res.wallet)}</b> · ${TIER_BADGE[res.tier] ?? res.tier}`);
    } catch (err) {
      toast('r', err instanceof WalletError ? err.message : 'Wallet connection failed');
    }
  }, [refreshMe, toast]);

  const visibleRows = useMemo(
    () =>
      feed.rows.filter((r) => filter === 'all' || r.dev.verdict === (FILTER_MAP[filter] ?? '')),
    [feed.rows, filter],
  );

  const scout = me.tier === 'SCOUT';

  return (
    <div id="view-terminal">
      <div className="topbar">
        <Link href="/" className="btn-icon" title="Back to site" aria-label="Back to site">
          ←
        </Link>
        <Link href="/" className="logo" style={{ cursor: 'pointer' }}>
          <span className="glyph" aria-hidden="true" />
          <span className="wordmark">
            DEV<em>RADAR</em>
          </span>
          <span className="terminal-tag">Terminal</span>
        </Link>
        <div className="tracebar" role="search">
          <span className="slash" aria-hidden="true">
            /
          </span>
          <input
            ref={traceInput}
            type="text"
            placeholder="Trace any CA or deployer wallet"
            aria-label="Trace contract address or deployer wallet"
            value={traceQuery}
            onChange={(e) => setTraceQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void runTrace(traceQuery);
                setTraceQuery('');
              }
            }}
          />
          <button
            className="btn btn-gold"
            type="button"
            onClick={() => {
              void runTrace(traceQuery);
              setTraceQuery('');
            }}
          >
            Trace
          </button>
        </div>
        <div className="top-right">
          <div className="session">
            <span>
              Deploys <b>{stats.dep}</b>
            </span>
            <span className="w">
              Winners <b>{stats.win}</b>
            </span>
            <span className="r">
              Flagged <b>{stats.rug}</b>
            </span>
          </div>
          <button
            className={`btn-icon${soundOn ? ' on' : ''}`}
            title="Winner alert sound"
            aria-pressed={soundOn}
            onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              soundOnRef.current = next;
              if (next && !audioCtx.current) {
                const Ctx =
                  window.AudioContext ??
                  (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
                if (Ctx) audioCtx.current = new Ctx();
              }
              toast('g', next ? 'Winner sound <b>on</b>' : 'Winner sound off');
            }}
          >
            ♪
          </button>
          <button
            className={`btn-icon${paused ? ' on' : ''}`}
            title={paused ? 'Resume feed' : 'Pause feed'}
            aria-pressed={paused}
            onClick={() => {
              setPaused((p) => {
                toast('g', p ? 'Feed live' : 'Feed paused');
                return !p;
              });
            }}
          >
            {paused ? '▶' : '❚❚'}
          </button>
          {!me.authenticated ? (
            <button className="btn btn-line btn-sm" onClick={() => void connect()}>
              Connect
            </button>
          ) : null}
          <span
            className="tierbadge"
            style={scout ? { cursor: 'pointer' } : undefined}
            title={scout ? 'Upgrade to Operator' : undefined}
            onClick={scout ? () => setPayTier('OPERATOR') : undefined}
          >
            {TIER_BADGE[me.tier] ?? me.tier}
          </span>
        </div>
      </div>

      <div className="main">
        <section className="panel" aria-label="Live deploys">
          <div className="panel-head">
            <span className="ph-title">
              <span className={`live-dot${paused ? ' paused' : ''}`} /> Live deploys
            </span>
            {scout ? (
              <span className="feed-note">Delayed 5 min · Scout</span>
            ) : (
              <span className="ph-sub">Feed latency 0.4s</span>
            )}
            <div className="filters" aria-label="Feed filters">
              {(['all', 'win', 'fresh', 'rug'] as const).map((f) => (
                <button
                  key={f}
                  className={`fpill${filter === f ? ' on' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f === 'win' ? 'Winners' : f === 'fresh' ? 'Fresh' : 'Flagged'}
                </button>
              ))}
            </div>
          </div>
          <div className="cols" aria-hidden="true">
            <span>Time</span>
            <span>Token</span>
            <span className="c-dev">Deployer</span>
            <span>Verdict</span>
            <span className="c-bundle">Bundle</span>
            <span>Score</span>
            <span className="c-act" style={{ textAlign: 'right' }}>
              Act
            </span>
          </div>
          <div className="feed scroll" role="list">
            {visibleRows.map((r) => (
              <div
                key={r.token.mint}
                role="listitem"
                className={`row${activeMint === r.token.mint ? ' active' : ''}${
                  feed.freshMints.has(r.token.mint) && !reducedMotion.current ? ' flash' : ''
                }`}
                onClick={() => selectRow(r)}
              >
                <span className="time">{rowTime(r.token.createdAt)}</span>
                <span className="tok">
                  <div className="tk">${r.token.symbol}</div>
                  <div className="nm">{r.token.name}</div>
                </span>
                <span className="dev">{shortAddr(r.dev.wallet)}</span>
                <span>
                  <span className={`verdict ${verdictClass(r.dev.verdict)}`}>
                    <span className="vd" />
                    {VERDICT_SHORT[r.dev.verdict] ?? r.dev.verdict}
                  </span>
                </span>
                <span className={`bundle${r.token.bundlePct >= 18 ? ' hot' : ''}`}>
                  {r.token.bundlePct}%
                </span>
                <span className={`score ${scoreClass(r.token.drScore)}`}>{r.token.drScore}</span>
                <span className="act">
                  <span
                    data-act="copy"
                    title="Copy CA"
                    onClick={(e) => {
                      e.stopPropagation();
                      copy('CA', r.token.mint);
                    }}
                  >
                    ⧉
                  </span>
                  <span
                    data-act="chart"
                    title="Open chart"
                    onClick={(e) => {
                      e.stopPropagation();
                      openChart(r.token.mint, r.token.symbol);
                    }}
                  >
                    ↗
                  </span>
                </span>
              </div>
            ))}
            {visibleRows.length === 0 ? (
              <div className="empty">
                <div className="ic">◎</div>
                <p>
                  {feed.rows.length === 0
                    ? 'Waiting for deploys — the feed fills the moment pump.fun mints.'
                    : 'Nothing matches this filter yet.'}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel" aria-label="Intelligence panel">
          <div className="tabs">
            <button className={`tab${tab === 'dossier' ? ' on' : ''}`} onClick={() => setTab('dossier')}>
              Dossier
            </button>
            <button className={`tab${tab === 'watch' ? ' on' : ''}`} onClick={() => setTab('watch')}>
              Watchlist {watchlist.length > 0 ? `(${watchlist.length})` : ''}
            </button>
            <button className={`tab${tab === 'top' ? ' on' : ''}`} onClick={() => setTab('top')}>
              Top Devs
            </button>
          </div>

          <div className={`tabview scroll${tab === 'dossier' ? ' on' : ''}`}>
            <DossierPanel
              state={dossier}
              sweeping={sweeping}
              followed={dossier.status === 'ready' && followedSet.has(dossier.dossier.dev.wallet)}
              onFollow={(w) => void toggleFollow(w)}
              onAlert={() => {
                if (!me.authenticated) {
                  toast('g', 'Connect your wallet to arm Telegram alerts');
                  return;
                }
                setTgModal(true);
              }}
              onCopy={copy}
              onChart={openChart}
              onUpgrade={() => setPayTier('OPERATOR')}
            />
          </div>

          <div className={`tabview scroll${tab === 'watch' ? ' on' : ''}`}>
            <div>
              {!me.authenticated ? (
                <div className="empty">
                  <div className="ic">◉</div>
                  <p>Connect your wallet to sync a watchlist across devices and Telegram.</p>
                  <button className="btn btn-gold btn-sm" style={{ marginTop: 18 }} onClick={() => void connect()}>
                    Connect wallet
                  </button>
                </div>
              ) : watchlist.length === 0 ? (
                <div className="empty">
                  <div className="ic">◉</div>
                  <p>No devs followed yet. Open a dossier and hit Follow.</p>
                </div>
              ) : (
                watchlist.map((w) => (
                  <div className="witem" key={w.wallet} onClick={() => void fetchDossier(w.wallet, null)}>
                    <div className="info">
                      <div className="addr">{shortAddr(w.wallet)}</div>
                      <div className="meta">
                        {w.lastLaunch ? (
                          <span className="hot">
                            deployed ${w.lastLaunch.symbol} · {timeAgo(w.lastLaunch.createdAt)}
                          </span>
                        ) : (
                          'idle · watching'
                        )}
                      </div>
                    </div>
                    <span className={`verdict ${verdictClass(w.dev?.verdict ?? 'FRESH')}`}>
                      <span className="vd" />
                      {VERDICT_SHORT[w.dev?.verdict ?? 'FRESH']}
                    </span>
                    <button
                      className="unf"
                      title="Unfollow"
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleFollow(w.wallet);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={`tabview scroll${tab === 'top' ? ' on' : ''}`}>
            <div className="lb-head" aria-hidden="true">
              <span>#</span>
              <span>Deployer</span>
              <span style={{ textAlign: 'right' }}>Launches</span>
              <span style={{ textAlign: 'right' }}>Best ATH</span>
              <span style={{ textAlign: 'right' }}>Score</span>
            </div>
            <div>
              {leaders.length === 0 ? (
                <div className="empty">
                  <div className="ic">◎</div>
                  <p>No proven deployers indexed yet — the board fills as outcomes resolve.</p>
                </div>
              ) : (
                leaders.map((l, i) => (
                  <div className="lrow" key={l.dev.wallet} onClick={() => void fetchDossier(l.dev.wallet, null)}>
                    <span className="rk">{String(i + 1).padStart(2, '0')}</span>
                    <span>
                      <div className="addr">{shortAddr(l.dev.wallet)}</div>
                      <div className="sub">
                        {VERDICT_LABEL[l.dev.verdict] ?? l.dev.verdict} · rug{' '}
                        {l.dev.rugRatePct === null ? '—' : `${l.dev.rugRatePct}%`}
                      </div>
                    </span>
                    <span className="num">{l.dev.launchCount}</span>
                    <span className="num ath">
                      {l.dev.bestAthUsd >= 1_000_000
                        ? `$${(l.dev.bestAthUsd / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
                        : l.dev.bestAthUsd >= 1000
                          ? `$${Math.round(l.dev.bestAthUsd / 1000)}K`
                          : '—'}
                    </span>
                    <span className={`num score ${scoreClass(l.drScore)}`}>{l.drScore}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="statusbar">
        <span className="grp">
          <span className="dot" aria-hidden="true" /> Indexing
        </span>
        <span className="grp">pump.fun · LaunchLab · Moonshot · Meteora</span>
        <span className="grp">
          Ghost Match <span className="gold">Active</span>
        </span>
        <span className="clock">{clock}</span>
      </div>

      {payTier ? (
        <PayModal tier={payTier} me={me} refreshMe={refreshMe} onClose={() => setPayTier(null)} />
      ) : null}
      {tgModal ? <TelegramLinkModal onClose={() => setTgModal(false)} /> : null}
    </div>
  );
}
