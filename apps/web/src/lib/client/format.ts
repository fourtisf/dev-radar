/** Display helpers matching the prototype's formatting exactly. */

export function shortAddr(wallet: string): string {
  if (wallet.length <= 12) return wallet;
  return `${wallet.slice(0, 4)}····${wallet.slice(-4)}`;
}

export function fmtUsd(n: number): string {
  if (n <= 0) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** 41m · 1.2h · 11d — like the prototype's lifespan column. */
export function fmtDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86_400) {
    const h = seconds / 3600;
    return h < 10 ? `${Math.round(h * 10) / 10}h` : `${Math.round(h)}h`;
  }
  return `${Math.round(seconds / 86_400)}d`;
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} hours ago`;
  if (s < 30 * 86_400) return `${Math.round(s / 86_400)} days ago`;
  if (s < 365 * 86_400) return `${Math.round(s / (30 * 86_400))} months ago`;
  return `${Math.round((s / (365 * 86_400)) * 10) / 10} years ago`;
}

export function clockTime(d: Date = new Date()): string {
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((x) => String(x).padStart(2, '0'))
    .join(':');
}

export function rowTime(iso: string): string {
  return clockTime(new Date(iso));
}

/** ≥70 hi · 40–69 mid · <40 lo (UI bands from the handoff). */
export function scoreClass(n: number): 'hi' | 'mid' | 'lo' {
  return n >= 70 ? 'hi' : n >= 40 ? 'mid' : 'lo';
}

/** Prisma verdict → prototype chip class (win/rug/fresh). */
export function verdictClass(verdict: string): 'win' | 'rug' | 'fresh' {
  if (verdict === 'WINNER') return 'win';
  if (verdict === 'RUGGER') return 'rug';
  return 'fresh'; // FRESH and NEUTRAL share the gold chip
}

export const VERDICT_SHORT: Record<string, string> = {
  WINNER: 'Winner',
  RUGGER: 'Rugger',
  FRESH: 'Fresh',
  NEUTRAL: 'Neutral',
};

export const VERDICT_LABEL: Record<string, string> = {
  WINNER: 'Serial Winner',
  RUGGER: 'Serial Rugger',
  FRESH: 'Fresh Wallet',
  NEUTRAL: 'Neutral',
};

export const OUTCOME_CLASS: Record<string, string> = {
  CLEAN: 'win',
  RUG: 'rug',
  LIVE: 'live',
  DEAD: '',
};

/** Stable dossier file number from the wallet (cosmetic, prototype-style). */
export function dossierFileNo(wallet: string): string {
  let h = 0;
  for (let i = 0; i < wallet.length; i++) h = (h * 31 + wallet.charCodeAt(i)) >>> 0;
  return `DR-2026-${String(100000 + (h % 110000))}`;
}
