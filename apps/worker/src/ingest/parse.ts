import {
  HELIUS_CREATE_TYPE,
  HELIUS_PUMP_FUN_SOURCE,
  PUMP_FUN_PROGRAM_ID,
  VENUE_PUMPFUN,
} from './constants';

/** A normalized pump.fun token-create event. */
export interface LaunchEvent {
  signature: string;
  mint: string;
  name: string;
  symbol: string;
  deployer: string;
  slot: number;
  /** Launch time (on-chain block time). */
  timestamp: Date;
  venue: string;
}

/** Subset of a Helius enhanced transaction the parser reads. */
interface EnhancedTxLike {
  signature?: unknown;
  slot?: unknown;
  timestamp?: unknown;
  type?: unknown;
  source?: unknown;
  feePayer?: unknown;
  description?: unknown;
  instructions?: unknown;
  tokenTransfers?: unknown;
  events?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function touchesPumpFun(tx: EnhancedTxLike): boolean {
  if (tx.source === HELIUS_PUMP_FUN_SOURCE) return true;
  if (!Array.isArray(tx.instructions)) return false;
  return tx.instructions.some(
    (ix) => isRecord(ix) && ix['programId'] === PUMP_FUN_PROGRAM_ID,
  );
}

function extractMint(tx: EnhancedTxLike): string | null {
  if (isRecord(tx.events)) {
    const tokenEvent = tx.events['token'];
    if (isRecord(tokenEvent) && typeof tokenEvent['mint'] === 'string') {
      return tokenEvent['mint'];
    }
  }
  if (Array.isArray(tx.tokenTransfers)) {
    for (const t of tx.tokenTransfers) {
      if (isRecord(t) && typeof t['mint'] === 'string' && t['mint'].length > 0) return t['mint'];
    }
  }
  return null;
}

/** Helius descriptions look like: "<wallet> created Giga Brain ($GIGABRAIN)". */
function extractNameSymbol(description: unknown): { name: string; symbol: string } {
  if (typeof description === 'string') {
    const m = /created\s+(.+?)\s+\(\$?([A-Za-z0-9_.-]+)\)\s*\.?\s*$/.exec(description);
    if (m && m[1] && m[2]) return { name: m[1].trim(), symbol: m[2].trim().toUpperCase() };
  }
  return { name: 'Unknown', symbol: 'UNKNOWN' };
}

/**
 * Parses a single enhanced transaction; returns null unless it is a
 * pump.fun token-create with a resolvable mint and deployer. Swaps and
 * anything else hitting the program are discarded here (the webhook
 * fast-path stays O(1)).
 */
export function parseCreateTx(raw: unknown): LaunchEvent | null {
  if (!isRecord(raw)) return null;
  const tx = raw as EnhancedTxLike;

  if (tx.type !== HELIUS_CREATE_TYPE) return null;
  if (!touchesPumpFun(tx)) return null;

  const mint = extractMint(tx);
  const deployer = typeof tx.feePayer === 'string' ? tx.feePayer : null;
  const signature = typeof tx.signature === 'string' ? tx.signature : null;
  if (!mint || !deployer || !signature) return null;

  const slot = typeof tx.slot === 'number' ? tx.slot : 0;
  const tsSec = typeof tx.timestamp === 'number' ? tx.timestamp : Math.floor(Date.now() / 1000);
  const { name, symbol } = extractNameSymbol(tx.description);

  return {
    signature,
    mint,
    name,
    symbol,
    deployer,
    slot,
    timestamp: new Date(tsSec * 1000),
    venue: VENUE_PUMPFUN,
  };
}

/** Helius webhooks POST an array of enhanced transactions. */
export function parseWebhookPayload(body: unknown): LaunchEvent[] {
  const txs = Array.isArray(body) ? body : [body];
  const events: LaunchEvent[] = [];
  for (const tx of txs) {
    const ev = parseCreateTx(tx);
    if (ev) events.push(ev);
  }
  return events;
}
