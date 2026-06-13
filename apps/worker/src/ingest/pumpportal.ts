import WebSocket from 'ws';
import { VENUE_PUMPFUN } from './constants';
import type { LaunchEvent } from './parse';

/**
 * PumpPortal — free real-time WebSocket stream of pump.fun activity
 * (https://pumpportal.fun/data-api/real-time). Subscribing to new-token
 * events gives us the launch feed at ZERO Helius cost: the deployer,
 * mint, name and symbol all arrive in the create message.
 *
 * Helius credits are then only spent on-demand (dossier backfill +
 * funding trace), not on the firehose of every launch + swap.
 *
 * ⚠ Unofficial third-party feed: the parser is defensive and skips any
 * message that doesn't carry a mint + creator, so a shape change can
 * never inject garbage.
 */
const WS_URL = 'wss://pumpportal.fun/api/data';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Map a PumpPortal new-token message to our internal LaunchEvent. */
export function parsePumpPortal(raw: unknown): LaunchEvent | null {
  if (!isRecord(raw)) return null;
  const txType = raw['txType'] ?? raw['type'];
  if (txType !== 'create') return null;

  const mint = raw['mint'];
  const deployer = raw['traderPublicKey'] ?? raw['creator'] ?? raw['deployer'];
  if (typeof mint !== 'string' || typeof deployer !== 'string') return null;

  const name = typeof raw['name'] === 'string' && raw['name'] ? raw['name'] : 'Unknown';
  const symbol =
    typeof raw['symbol'] === 'string' && raw['symbol'] ? raw['symbol'].toUpperCase() : 'UNKNOWN';
  const signature = typeof raw['signature'] === 'string' ? raw['signature'] : `pp-${mint}`;

  return {
    signature,
    mint,
    name,
    symbol,
    deployer,
    slot: 0, // PumpPortal create messages omit slot
    timestamp: new Date(),
    venue: VENUE_PUMPFUN,
  };
}

export interface PumpPortalLog {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

export interface PumpPortalOptions {
  onLaunch: (ev: LaunchEvent) => Promise<void>;
  log: PumpPortalLog;
}

/**
 * Opens the PumpPortal stream and forwards new creations to `onLaunch`.
 * Auto-reconnects with exponential backoff. Returns a stop function.
 */
export function startPumpPortal(opts: PumpPortalOptions): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let backoff = 1000;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const connect = (): void => {
    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      backoff = 1000;
      ws?.send(JSON.stringify({ method: 'subscribeNewToken' }));
      opts.log.info({}, 'pumpportal: connected — streaming new pump.fun launches');
      pingTimer = setInterval(() => {
        try {
          ws?.ping();
        } catch {
          /* socket already gone */
        }
      }, 30_000);
    });

    ws.on('message', (data: WebSocket.RawData) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      const ev = parsePumpPortal(parsed);
      if (!ev) return;
      void opts.onLaunch(ev).catch((err) =>
        opts.log.error({ err: String(err), mint: ev.mint }, 'pumpportal launch handler failed'),
      );
    });

    ws.on('error', (err: Error) => opts.log.warn({ err: err.message }, 'pumpportal ws error'));

    ws.on('close', () => {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
      if (closed) return;
      const wait = backoff;
      backoff = Math.min(backoff * 2, 30_000);
      opts.log.warn({ waitMs: wait }, 'pumpportal: disconnected, reconnecting');
      setTimeout(connect, wait);
    });
  };

  connect();

  return () => {
    closed = true;
    if (pingTimer) clearInterval(pingTimer);
    ws?.close();
  };
}
