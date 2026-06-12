import { Queue } from 'bullmq';
import { createRedis } from './redis';

export const QUEUE = {
  backfillDev: 'backfill-dev',
  launchAnalysis: 'launch-analysis',
  alerts: 'alerts',
  traceResolve: 'trace-resolve',
  deadLetter: 'dead-letter',
} as const;

export interface BackfillDevJob {
  wallet: string;
}

export interface LaunchAnalysisJob {
  mint: string;
  deployer: string;
  slot: number;
}

export interface AlertJob {
  /** 'deploy' (default) or 'rug-link' (funding flagged after a trace). */
  kind?: 'deploy' | 'rug-link';
  mint: string;
  symbol: string;
  name: string;
  ca: string;
  devWallet: string;
  verdict: string;
  launchCount: number;
  rugCount: number;
  bestAthUsd: number;
  bundlePct: number;
  sniperLvl: string;
  drScore: number;
}

export interface TraceResolveJob {
  query: string;
}

const connection = createRedis();

export const backfillQueue = new Queue<BackfillDevJob>(QUEUE.backfillDev, {
  connection,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: false,
  },
});

export const launchAnalysisQueue = new Queue<LaunchAnalysisJob>(QUEUE.launchAnalysis, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export const alertsQueue = new Queue<AlertJob>(QUEUE.alerts, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 1000 },
  },
});

export const traceResolveQueue = new Queue<TraceResolveJob>(QUEUE.traceResolve, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 500 },
  },
});

/** Jobs that exhausted their retries get parked here for inspection. */
export const deadLetterQueue = new Queue(QUEUE.deadLetter, {
  connection,
  defaultJobOptions: { removeOnComplete: false, removeOnFail: false },
});
