import { EventEmitter } from 'node:events';
import pg from 'pg';

/**
 * Singleton Postgres LISTEN bridge. The worker NOTIFYs 'deploys' and
 * 'dossier-update'; every open SSE connection subscribes to this
 * emitter rather than holding its own DB connection.
 */
type BusEvent = { channel: string; payload: unknown };

class NotifyBus extends EventEmitter {
  private client: pg.Client | null = null;
  private connecting = false;
  private backoffMs = 1000;

  async ensureConnected(): Promise<void> {
    if (this.client || this.connecting) return;
    this.connecting = true;
    try {
      const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      await client.query('LISTEN "deploys"');
      await client.query('LISTEN "dossier-update"');
      client.on('notification', (msg) => {
        let payload: unknown = null;
        try {
          payload = msg.payload ? JSON.parse(msg.payload) : null;
        } catch {
          return;
        }
        this.emit('event', { channel: msg.channel, payload } satisfies BusEvent);
      });
      client.on('error', () => this.reconnect());
      client.on('end', () => this.reconnect());
      this.client = client;
      this.backoffMs = 1000;
    } catch {
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private reconnect(): void {
    if (this.client) {
      this.client.removeAllListeners();
      void this.client.end().catch(() => undefined);
      this.client = null;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const wait = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
    setTimeout(() => void this.ensureConnected(), wait);
  }

  subscribe(handler: (e: BusEvent) => void): () => void {
    void this.ensureConnected();
    this.on('event', handler);
    return () => this.off('event', handler);
  }
}

const globalForBus = globalThis as unknown as { notifyBus?: NotifyBus };
export const notifyBus: NotifyBus = globalForBus.notifyBus ?? new NotifyBus();
globalForBus.notifyBus = notifyBus;
notifyBus.setMaxListeners(500);
