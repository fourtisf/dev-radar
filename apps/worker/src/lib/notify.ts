import pg from 'pg';
import { env } from '../env';

/**
 * Postgres NOTIFY channels. The web app LISTENs on these and fans out
 * over SSE (/api/feed/live). Payloads must stay well under the 8000
 * byte NOTIFY limit — send compact snapshots, not whole dossiers.
 */
export const CHANNEL = {
  deploys: 'deploys',
  dossierUpdate: 'dossier-update',
} as const;

export interface DeployNotification {
  type: 'deploy';
  token: {
    mint: string;
    symbol: string;
    name: string;
    venue: string;
    createdAt: string;
    bundlePct: number;
    sniperLvl: string;
    drScore: number;
  };
  dev: {
    wallet: string;
    verdict: string;
    confidence: number;
    launchCount: number;
    rugCount: number;
    bestAthUsd: number;
    flagged: boolean;
  };
}

export interface DossierUpdateNotification {
  type: 'dossier-update';
  wallet: string;
  verdict: string;
  drScore: number;
  mint?: string;
  bundlePct?: number;
  sniperLvl?: string;
}

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3 });

export async function pgNotify(
  channel: (typeof CHANNEL)[keyof typeof CHANNEL],
  payload: DeployNotification | DossierUpdateNotification,
): Promise<void> {
  await pool.query('SELECT pg_notify($1, $2)', [channel, JSON.stringify(payload)]);
}

export async function closeNotifyPool(): Promise<void> {
  await pool.end();
}
