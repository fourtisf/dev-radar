'use client';

/**
 * Landing view — 1:1 port of #view-landing from
 * reference/devradar-site.html. Same markup, same class names, same
 * motion; the terminal-preview frame consumes the real SSE feed and
 * the hero dossier cycles three real flagship profiles (ISR-fetched).
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { rowTime, scoreClass, shortAddr, VERDICT_SHORT, verdictClass } from '@/lib/client/format';
import { ToastProvider } from '@/lib/client/toast';
import { useLiveFeed } from '@/lib/client/useLiveFeed';
import { useMe } from '@/lib/client/useMe';
import { PayModal } from '@/components/PayModal';
import { BrandGlyph } from '@/components/BrandGlyph';
import type { LpProfile } from './profiles';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Scroll-reveal: .hl staggers in on load, .rv reveals on intersection. */
function useReveals(rootRef: React.RefObject<HTMLElement>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll('.hl').forEach((el, i) => {
      setTimeout(() => el.classList.add('in'), 120 + i * 110);
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    root.querySelectorAll('.rv:not(.hl)').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootRef]);
}

function HeroDossier({ profiles }: { profiles: LpProfile[] }): JSX.Element {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [tracing, setTracing] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (reduced || profiles.length < 2) return;
    const id = setInterval(() => {
      setTracing(true);
      setTimeout(() => setIndex((i) => (i + 1) % profiles.length), 430);
      setTimeout(() => setTracing(false), 980);
    }, 5600);
    return () => clearInterval(id);
  }, [reduced, profiles.length]);

  const onMove = (e: React.MouseEvent): void => {
    const card = cardRef.current;
    if (!card || reduced) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  const p = profiles[index] ?? profiles[0]!;

  return (
    <article
      className={`lp-dossier${tracing ? ' tracing' : ''}`}
      ref={cardRef}
      onMouseMove={onMove}
      aria-live="polite"
    >
      <span className="scanline" aria-hidden="true" />
      <div className="d-top">
        <span className="t">{p.file}</span>
        <span className="d-status">
          <span className="dot" aria-hidden="true" />
          <span className="live">Live file</span>
          <span className="trc">Re-tracing…</span>
        </span>
      </div>
      <div className="d-content">
        <div className="d-id">
          <div>
            <div className="d-wallet">{p.wallet}</div>
            <div className="d-sub">{p.sub}</div>
          </div>
          <span className={`verdict ${p.verdict.cls}`}>
            <span className="vd" aria-hidden="true" />
            <span>{p.verdict.t}</span>
          </span>
        </div>
        <div className="d-stats">
          <div className="ds">
            <div className="k">Launches</div>
            <div className="v">{p.launch}</div>
          </div>
          <div className="ds">
            <div className="k">Rug rate</div>
            <div className={`v ${p.rug.cls}`}>{p.rug.v}</div>
          </div>
          <div className="ds">
            <div className="k">Best ATH</div>
            <div className="v">{p.ath}</div>
          </div>
          <div className="ds">
            <div className="k">Lifespan</div>
            <div className="v">{p.life}</div>
          </div>
        </div>
        <div className="d-fund">
          <span className="k">FUNDING</span> →{' '}
          {p.fund.map((seg, i) =>
            seg.gold ? (
              <span key={i} className="a">
                {seg.text}
              </span>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </div>
        <div className="d-ph">Prior launches</div>
        <div>
          {p.priors.map((pr) => (
            <div className="prior" key={pr.t + pr.m}>
              <span className="t">{pr.t}</span>
              <span className="m">{pr.m}</span>
              <span className={`o ${pr.cls}`}>{pr.o}</span>
            </div>
          ))}
        </div>
        <div className="d-foot">
          <span>
            Trace <b>{p.time}</b>
          </span>
          <span>
            Confidence <b>{p.conf}</b>
          </span>
        </div>
      </div>
    </article>
  );
}

/** Terminal-section preview frame: real SSE feed, last 8 rows. */
function LivePreview(): JSX.Element {
  const { rows, freshMints } = useLiveFeed({ max: 8 });
  return (
    <div className="frame-body">
      <div id="preview">
        {rows.map((r) => (
          <div
            key={r.token.mint}
            className={`pv-row${freshMints.has(r.token.mint) ? ' flash' : ''}`}
          >
            <span className="time">{rowTime(r.token.createdAt)}</span>
            <span>
              <div className="tk">${r.token.symbol}</div>
              <div className="nm">
                {shortAddr(r.dev.wallet)} · {r.token.name}
              </div>
            </span>
            <span>
              <span className={`verdict ${verdictClass(r.dev.verdict)}`}>
                <span className="vd" />
                {VERDICT_SHORT[r.dev.verdict] ?? r.dev.verdict}
              </span>
            </span>
            <span className={`score ${scoreClass(r.token.drScore)}`}>{r.token.drScore}</span>
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="empty">
            <div className="ic">◎</div>
            <p>Waiting for the first deploy… the engine indexes the moment pump.fun mints.</p>
          </div>
        ) : null}
      </div>
      <Link href="/app" className="btn btn-gold btn-sm frame-cta">
        Open full terminal
      </Link>
    </div>
  );
}

const TICKER_ITEMS = [
  { lab: 'NEW DEPLOY', tok: '$GIGABRAIN', sub: '7xKp····9fQm', cls: 'win', v: 'SERIAL WINNER' },
  { lab: 'NEW DEPLOY', tok: '$ELONAI2', sub: 'Dk3r····x2Vn', cls: 'rug', v: 'SERIAL RUGGER' },
  { lab: 'NEW DEPLOY', tok: '$MOONCAT', sub: '9mTw····k4Lp', cls: 'fresh', v: 'FRESH WALLET' },
  { lab: 'BUNDLE FLAG', tok: '$PEPEKING', sub: 'cluster holds 31.4%', cls: 'rug', v: 'HIGH RISK' },
  { lab: 'NEW DEPLOY', tok: '$DEGENDOG', sub: 'Hf8s····p1Qr', cls: 'win', v: 'SERIAL WINNER' },
  { lab: 'FUNDING FLAG', tok: '$SAFEMARS', sub: 'linked to known rugger', cls: 'rug', v: 'AVOID' },
  { lab: 'NEW DEPLOY', tok: '$WAGMI', sub: '3nVc····t7Ws', cls: 'fresh', v: 'FRESH WALLET' },
];

export function LandingClient({ profiles }: { profiles: LpProfile[] }): JSX.Element {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [heroQuery, setHeroQuery] = useState('');
  const [payTier, setPayTier] = useState<'OPERATOR' | 'SYNDICATE' | null>(null);
  const { me, refresh } = useMe();

  useReveals(rootRef);

  useEffect(() => {
    const onScroll = (): void => {
      navRef.current?.classList.toggle('scrolled', window.scrollY > 24);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const heroTrace = (): void => {
    const v = heroQuery.trim();
    router.push(v ? `/app?trace=${encodeURIComponent(v)}` : '/app');
  };

  return (
    <ToastProvider>
      <div id="view-landing" ref={rootRef}>
        <nav ref={navRef}>
          <div className="nav-in">
            <Link className="logo" href="/" aria-label="DevRadar home">
              <BrandGlyph />
              <span className="wordmark">
                DEV<em>RADAR</em>
              </span>
            </Link>
            <div className="nav-links">
              <a href="#terminal">Terminal</a>
              <a href="#capabilities">Capabilities</a>
              <a href="#alerts">Alerts</a>
              <a href="#pricing">Pricing</a>
            </div>
            <Link href="/app" className="btn btn-gold btn-sm">
              Launch App
            </Link>
          </div>
        </nav>

        <header className="hero">
          <div className="hero-rings" aria-hidden="true" />
          <div className="hero-glow" aria-hidden="true" />
          <div className="wrap hero-grid">
            <div>
              <span className="label hl rv">Deployer Intelligence · Solana</span>
              <h1 className="hl rv">
                Know the dev
                <br />
                before <span className="goldtx">you ape.</span>
              </h1>
              <p className="lede hl rv">
                Every deployer wallet carries a record — launches, rugs, bundles, funding.
                DevRadar compiles it into one dossier in under two seconds. Before your entry, not
                after.
              </p>
              <div className="scanbar hl rv" role="search">
                <input
                  type="text"
                  placeholder="Paste contract address or deployer wallet"
                  aria-label="Contract address or deployer wallet"
                  value={heroQuery}
                  onChange={(e) => setHeroQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') heroTrace();
                  }}
                />
                <button className="btn btn-gold" type="button" onClick={heroTrace}>
                  Trace
                </button>
              </div>
              <div className="hero-meta hl rv">
                <span>
                  <b>184,302</b> deployers indexed
                </span>
                <span className="sep" aria-hidden="true" />
                <span>
                  <b>61,448</b> rugs flagged
                </span>
                <span className="sep" aria-hidden="true" />
                <span>
                  median trace <i>1.8s</i>
                </span>
              </div>
            </div>

            <div className="hero-visual hl rv">
              <HeroDossier profiles={profiles} />
            </div>
          </div>
        </header>

        <div className="ticker" aria-hidden="true">
          <div className="ticker-track">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((t, i) => (
              <span className="tkk" key={i}>
                <span className="lab">{t.lab}</span>
                <span className="tok">{t.tok}</span>
                <span>{t.sub}</span>
                <span className={`vd ${t.cls}`} />
                <span className={`v ${t.cls}`}>{t.v}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="coverage">
          <div className="wrap coverage-in rv">
            <span className="cl">Indexed venues</span>
            <span className="cd" aria-hidden="true" />
            <span className="cv">pump.fun</span>
            <span className="cd" aria-hidden="true" />
            <span className="cv">Raydium LaunchLab</span>
            <span className="cd" aria-hidden="true" />
            <span className="cv">Meteora</span>
            <span className="cd" aria-hidden="true" />
            <span className="cv">Moonshot</span>
          </div>
        </div>

        <section className="section problem">
          <div className="wrap">
            <div className="rv">
              <span className="label">The blind spot</span>
              <h2>
                The trenches don&apos;t kill traders.
                <br />
                <span className="goldtx">Deployers do.</span>
              </h2>
              <p className="lede">
                You can read the chart, the bundle, the lore. But the single variable that decides
                whether a token runs or rugs is the human who deployed it — and that wallet has a
                history nobody checks at launch speed.
              </p>
            </div>
            <div className="truths">
              <div className="truth rv">
                <div className="n">
                  ~98<em>%</em>
                </div>
                <p>of new Solana launches never reach a sustained market cap. Most die by design.</p>
                <span className="src">On-chain launch outcomes</span>
              </div>
              <div className="truth rv">
                <div className="n">
                  1 <em>dev</em>
                </div>
                <p>
                  behind dozens of tickers. Serial ruggers redeploy from fresh-looking wallets
                  within hours.
                </p>
                <span className="src">Funding-trace clustering</span>
              </div>
              <div className="truth rv">
                <div className="n">
                  &lt;2<em>s</em>
                </div>
                <p>
                  is how long DevRadar needs to compile the full record. Faster than your buy
                  confirms.
                </p>
                <span className="src">Median dossier trace</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="capabilities" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="caps-head rv">
              <div>
                <span className="label">Capabilities</span>
                <h2>
                  The full file,
                  <br />
                  not a vibe check.
                </h2>
              </div>
              <p className="lede">
                Contract scanners read code. DevRadar reads the human — track record, behavior, and
                money flow behind every deploy.
              </p>
            </div>
            <div className="bento">
              <div className="cell cell-wide rv">
                <div className="inner">
                  <div>
                    <span className="ftag">Trace</span>
                    <h3>Deployer dossier</h3>
                    <p>
                      Every prior launch from the wallet — peak market caps, outcomes, token
                      lifespans — compiled back to its first transaction.
                    </p>
                  </div>
                  <div className="mini-list" aria-hidden="true">
                    <div className="prior">
                      <span className="t">$CATGPT</span>
                      <span className="m">peak $4.2M</span>
                      <span className="o win">CLEAN</span>
                    </div>
                    <div className="prior">
                      <span className="t">$ELONAI</span>
                      <span className="m">peak $310K</span>
                      <span className="o rug">RUG</span>
                    </div>
                    <div className="prior">
                      <span className="t">$NORTH</span>
                      <span className="m">peak $1.2M</span>
                      <span className="o live">LIVE</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="cell rv">
                <span className="ftag">Label</span>
                <h3>Auto-classification</h3>
                <p>One verdict, computed from the on-chain record. Not Twitter sentiment.</p>
                <div className="chips" aria-hidden="true">
                  <span className="verdict win">
                    <span className="vd" />
                    Winner
                  </span>
                  <span className="verdict rug">
                    <span className="vd" />
                    Rugger
                  </span>
                  <span className="verdict fresh">
                    <span className="vd" />
                    Fresh
                  </span>
                </div>
              </div>
              <div className="cell rv">
                <span className="ftag">Bundle</span>
                <h3>Bundle detection</h3>
                <p>
                  Supply concentration at block zero. See what share the dev&apos;s own cluster holds
                  before you take the other side.
                </p>
              </div>
              <div className="cell rv">
                <span className="ftag">Snipe</span>
                <h3>Sniper clusters</h3>
                <p>
                  Coordinated first-block buyers mapped and flagged within seconds — the wallets
                  positioned to exit on you.
                </p>
              </div>
              <div className="cell rv">
                <span className="ftag">Ghost</span>
                <h3>Ghost Match</h3>
                <p>
                  Fresh wallet, familiar fingerprint. Funding lineage and behavior patterns link
                  &quot;new&quot; devs to flagged ruggers.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section tsec" id="terminal">
          <div className="tsec-glow" aria-hidden="true" />
          <div className="wrap tsec-grid">
            <div className="tsec-copy rv">
              <span className="label">The terminal</span>
              <h2>
                Every deploy,
                <br />
                <span className="goldtx">already read.</span>
              </h2>
              <p className="lede">
                This is the live surface. Deploys stream in, verdicts attach in milliseconds, and
                the full dossier is one click away. The feed on the right is the real engine —
                running now.
              </p>
              <div className="tsec-points">
                <div className="tp">
                  <span className="ic">✓</span>
                  <span>
                    <b>DR Score on every launch.</b> One 0–100 number from record, bundle, snipers
                    and funding.
                  </span>
                </div>
                <div className="tp">
                  <span className="ic">✓</span>
                  <span>
                    <b>Filters that matter.</b> Winners-only mode turns the firehose into a sniper
                    scope.
                  </span>
                </div>
                <div className="tp">
                  <span className="ic">✓</span>
                  <span>
                    <b>Watchlist &amp; leaderboard built in.</b> Follow proven devs, study the top
                    of the board.
                  </span>
                </div>
              </div>
              <div className="tsec-actions">
                <Link href="/app" className="btn btn-gold">
                  Launch terminal
                </Link>
                <a className="btn btn-line" href="#pricing">
                  See access tiers
                </a>
              </div>
            </div>

            <div className="rv">
              <div className="frame">
                <div className="frame-bar">
                  <span className="fdot g" aria-hidden="true" />
                  <span className="fdot" aria-hidden="true" />
                  <span className="fdot" aria-hidden="true" />
                  <span className="ft">DevRadar — Live deploys</span>
                  <span className="fl">
                    <span className="dot" aria-hidden="true" />
                    Live
                  </span>
                </div>
                <LivePreview />
              </div>
            </div>
          </div>
        </section>

        <section className="section protocol" id="protocol">
          <div className="wrap">
            <div className="rv">
              <span className="label">Protocol</span>
              <h2>
                Three moves.
                <br />
                Under two seconds.
              </h2>
            </div>
            <div className="rail rv" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div className="steps">
              <div className="step rv">
                <div className="sn">01 — Input</div>
                <h3>Paste the CA</h3>
                <p>
                  Drop any Solana contract address — or the deployer wallet directly. DevRadar
                  resolves the dev behind the token instantly.
                </p>
                <div className="term">
                  <span className="c">›</span> trace <b>8GsK····pump</b>
                </div>
              </div>
              <div className="step rv">
                <div className="sn">02 — Compile</div>
                <h3>We pull the record</h3>
                <p>
                  Every prior launch, outcome, bundle footprint and funding hop — compiled into a
                  single dossier with a confidence score.
                </p>
                <div className="term">
                  <span className="c">›</span> 14 launches · 0 rugs · funded via <b>CEX</b>
                </div>
              </div>
              <div className="step rv">
                <div className="sn">03 — Verdict</div>
                <h3>You decide armed</h3>
                <p>
                  Classification, DR Score, risk flags and full history — rendered before your buy
                  would have confirmed. Then it&apos;s your call.
                </p>
                <div className="term">
                  <span className="c">›</span> verdict <b>SERIAL WINNER</b> · score 92
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="alerts">
          <div className="wrap alerts-grid">
            <div className="alerts-copy rv">
              <span className="label">Telegram alerts</span>
              <h2>
                Proven devs,
                <br />
                <span className="goldtx">pushed to you.</span>
              </h2>
              <p className="lede">
                Don&apos;t watch the feed — let the feed watch for you. DevRadar streams classified
                deploys straight to Telegram, filtered by the only thing that matters: the record.
              </p>
              <div className="apoints">
                <div className="tp">
                  <span className="ic">✓</span>
                  <span>
                    <b>Winner-only mode.</b> Only alert when a deployer with a verified track record
                    goes live.
                  </span>
                </div>
                <div className="tp">
                  <span className="ic">✓</span>
                  <span>
                    <b>Rug shield.</b> Instant flag when a token you hold links to a known
                    rugger&apos;s wallet cluster.
                  </span>
                </div>
                <div className="tp">
                  <span className="ic">✓</span>
                  <span>
                    <b>Dev watchlists.</b> Follow specific wallets and get pinged the block they
                    deploy.
                  </span>
                </div>
              </div>
            </div>
            <div className="alert-stage rv">
              <div className="stage-glow" aria-hidden="true" />
              <div className="float t1" aria-hidden="true">
                <span className="vd" style={{ color: 'var(--win)' }} />
                <span className="tok">$DEGENDOG</span>
                <span style={{ color: 'var(--win)' }}>WINNER LIVE</span>
              </div>
              <div className="float t2" aria-hidden="true">
                <span className="vd" style={{ color: 'var(--rug)' }} />
                <span className="tok">$SAFEMARS</span>
                <span style={{ color: 'var(--rug)' }}>RUG LINK</span>
              </div>
              <div className="tg" aria-label="Example Telegram alert">
                <div className="tg-head">
                  <div className="tg-ava">DR</div>
                  <div>
                    <div className="n">DevRadar Bot</div>
                    <div className="s">LIVE FEED</div>
                  </div>
                </div>
                <div className="tg-body">
                  <div className="tg-msg">
                    <span className="hd">● PROVEN DEPLOYER LIVE</span>
                    <br />
                    <span className="tk2">$NORTH</span> — North Road Dog
                    <br />
                    <span className="ln" aria-hidden="true" />
                    Dev <span className="am">7xKp····9fQm</span> · Serial Winner
                    <br />
                    14 launches · 0 rugs · best ATH <span className="am">$4.2M</span>
                    <br />
                    Bundle <span className="am">4.1%</span> · Snipers <span className="am">low</span>{' '}
                    · DR Score <span className="am">92</span>
                    <br />
                    <span className="ln" aria-hidden="true" />
                    <span className="dim">dossier · chart · dev history</span>
                  </div>
                  <div className="tg-time">
                    Delivered <b>1.8s</b> after deploy
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="pricing" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="pricing-head rv">
              <span className="label">Access</span>
              <h2>
                Priced in SOL. Paid for
                <br />
                by <span className="goldtx">one avoided rug.</span>
              </h2>
            </div>
            <div className="tiers">
              <div className="tier rv">
                <div className="tname">Scout</div>
                <div className="tprice">
                  <span className="p">Free</span>
                </div>
                <p className="tfor">For checking before you ape.</p>
                <ul>
                  <li>
                    <b>10 dossiers</b> per day
                  </li>
                  <li>Classification &amp; core history</li>
                  <li>Live feed · real time</li>
                  <li>Community Telegram channel</li>
                </ul>
                <Link href="/app" className="btn btn-line">
                  Start scanning
                </Link>
              </div>
              <div className="tier tier-featured rv">
                <div className="badge">Most deployed</div>
                <div className="tname">Operator</div>
                <div className="tprice">
                  <span className="p">2 SOL</span>
                  <span className="per">/ month</span>
                </div>
                <p className="tfor">For the trenches, at full speed.</p>
                <ul>
                  <li>
                    <b>Unlimited</b> dossiers &amp; DR Scores
                  </li>
                  <li>
                    <b>Real-time</b> Telegram alerts
                  </li>
                  <li>Bundle &amp; sniper detection</li>
                  <li>Ghost Match + funding trace</li>
                  <li>Custom dev watchlists</li>
                </ul>
                <button className="btn btn-gold" onClick={() => setPayTier('OPERATOR')}>
                  Go Operator
                </button>
              </div>
              <div className="tier rv">
                <div className="tname">Syndicate</div>
                <div className="tprice">
                  <span className="p">8 SOL</span>
                  <span className="per">/ month</span>
                </div>
                <p className="tfor">For groups, bots and builders.</p>
                <ul>
                  <li>Everything in Operator</li>
                  <li>
                    <b>API + webhooks</b>
                  </li>
                  <li>5 seats included</li>
                  <li>Priority trace queue</li>
                  <li>Direct line to the team</li>
                </ul>
                <button className="btn btn-line" onClick={() => setPayTier('SYNDICATE')}>
                  Request access
                </button>
              </div>
            </div>
            <p className="pnote">
              Pay in <i>SOL</i> · cancel any epoch · no KYC
            </p>
          </div>
        </section>

        <section className="section final">
          <div className="fin-glow" aria-hidden="true" />
          <div className="wrap rv">
            <span className="label">Open file</span>
            <h2>
              The dev already has a record.
              <br />
              <span className="goldtx">Read it first.</span>
            </h2>
            <p className="lede" style={{ textAlign: 'center' }}>
              One dossier takes two seconds. One rug takes your whole bag.
              <br />
              The math has never been complicated.
            </p>
            <div className="final-actions">
              <Link href="/app" className="btn btn-gold">
                Launch terminal
              </Link>
              <a className="btn btn-line" href="#alerts">
                Get Telegram alerts
              </a>
            </div>
          </div>
        </section>

        <footer>
          <div className="wrap">
            <div className="foot-grid">
              <div className="foot-brand">
                <Link className="logo" href="/">
                  <BrandGlyph />
                  <span className="wordmark">
                    DEV<em>RADAR</em>
                  </span>
                </Link>
                <p>Deployer intelligence for Solana. On-chain history, compiled before your entry.</p>
              </div>
              <div className="foot-cols">
                <div className="fcol">
                  <div className="fh">Product</div>
                  <Link href="/app">Terminal</Link>
                  <a href="#capabilities">Capabilities</a>
                  <a href="#alerts">Alerts</a>
                  <a href="#pricing">Pricing</a>
                </div>
                <div className="fcol">
                  <div className="fh">Ecosystem</div>
                  <a href="#">Fourtis</a>
                  <a href="#">PumpRadar</a>
                  <a href="#">WhaleFlow</a>
                  <a href="#">ApeWise</a>
                </div>
                <div className="fcol">
                  <div className="fh">Channels</div>
                  <a href="#">Telegram</a>
                  <a href="#">X / Twitter</a>
                  <a href="#">Status</a>
                </div>
              </div>
            </div>
            <div className="foot-base">
              <span>
                © 2026 DevRadar · A <span className="f">Fourtis</span> ecosystem product
              </span>
              <span>On-chain history · Not financial advice</span>
            </div>
            <div className="watermark-clip" aria-hidden="true">
              <div className="watermark">DEVRADAR</div>
            </div>
          </div>
        </footer>
      </div>

      {payTier ? (
        <PayModal tier={payTier} me={me} refreshMe={refresh} onClose={() => setPayTier(null)} />
      ) : null}
    </ToastProvider>
  );
}
