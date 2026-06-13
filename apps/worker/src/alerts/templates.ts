import { env } from '../env';
import type { AlertJob } from '../lib/queues';

/**
 * Message formatting per the prototype's TG mockup (reference/
 * devradar-site.html, #alerts section) — header dot line, token line,
 * hairline, dev record, bundle/snipers/DR Score line, hairline, links.
 */
const LINE = '─────────────────────';

export const VERDICT_LABEL: Record<string, string> = {
  WINNER: 'Serial Winner',
  RUGGER: 'Serial Rugger',
  FRESH: 'Fresh Wallet',
  NEUTRAL: 'Neutral',
};

export function shortAddr(wallet: string): string {
  if (wallet.length <= 12) return wallet;
  return `${wallet.slice(0, 4)}····${wallet.slice(-4)}`;
}

export function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function links(job: AlertJob): string {
  const dossier = `${env.APP_URL}/app?dev=${job.devWallet}`;
  // Chart link is a placeholder until an execution partner is wired.
  const chart = `https://pump.fun/${job.mint}`;
  return `<a href="${dossier}">dossier</a> · <a href="${chart}">chart</a> · <a href="${dossier}">dev history</a>`;
}

function recordBlock(job: AlertJob): string {
  const verdict = VERDICT_LABEL[job.verdict] ?? job.verdict;
  const snipers = job.sniperLvl.toLowerCase();
  return [
    `Dev <code>${shortAddr(job.devWallet)}</code> · ${verdict}`,
    `${job.launchCount} launches · ${job.rugCount} rugs · best ATH ${fmtUsd(job.bestAthUsd)}`,
    `Bundle ${job.bundlePct}% · Snipers ${snipers} · DR Score ${job.drScore}`,
  ].join('\n');
}

/** Winner deploy (Operator+): `● PROVEN DEPLOYER LIVE`. */
export function winnerDeployMessage(job: AlertJob): string {
  return [
    '<b>● PROVEN DEPLOYER LIVE</b>',
    `<b>$${esc(job.symbol)}</b> — ${esc(job.name)}`,
    LINE,
    recordBlock(job),
    LINE,
    links(job),
  ].join('\n');
}

/** Rugger deploy (channel broadcast): warn that a serial rugger is live. */
export function ruggerDeployMessage(job: AlertJob): string {
  return [
    '<b>⚠️ SERIAL RUGGER LIVE</b>',
    `<b>$${esc(job.symbol)}</b> — ${esc(job.name)}`,
    LINE,
    recordBlock(job),
    LINE,
    '<b>Avoid.</b> ' + links(job),
  ].join('\n');
}

/** Watchlist deploy: any tier with that dev followed. */
export function watchlistDeployMessage(job: AlertJob): string {
  return [
    '<b>● WATCHLIST DEPLOYER LIVE</b>',
    `<b>$${esc(job.symbol)}</b> — ${esc(job.name)}`,
    LINE,
    recordBlock(job),
    LINE,
    links(job),
  ].join('\n');
}

/** Rug-link flag (Operator+): a traced dev got LINKED_FLAGGED. */
export function rugLinkMessage(job: AlertJob): string {
  return [
    '<b>● RUG LINK FLAGGED</b>',
    `<b>$${esc(job.symbol)}</b> — ${esc(job.name)}`,
    LINE,
    `Dev <code>${shortAddr(job.devWallet)}</code> funding traced to a flagged rugger cluster.`,
    `You traced this deployer in the last 7 days.`,
    LINE,
    links(job),
  ].join('\n');
}
