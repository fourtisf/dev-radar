'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeployEvent, DossierUpdateEvent, FeedRow } from './types';

function rowFromDeploy(e: DeployEvent): FeedRow {
  return {
    token: {
      ...e.token,
      outcome: 'LIVE',
      peakMcapUsd: 0,
      lifespanS: 0,
    },
    dev: {
      ...e.dev,
      firstSeenAt: e.token.createdAt,
      cleanCount: 0,
      medianLifespanS: 0,
      fundingType: 'UNVERIFIED',
      fundingPath: null,
      backfilled: false,
      rugRatePct:
        e.dev.launchCount > 0 ? Math.round((e.dev.rugCount / e.dev.launchCount) * 100) : null,
    },
  };
}

export interface LiveFeedOptions {
  max: number;
  paused?: boolean;
  /** Called for each row actually added to the visible feed. */
  onAdded?: (row: FeedRow, live: boolean) => void;
  onDossierUpdate?: (e: DossierUpdateEvent) => void;
}

export interface LiveFeed {
  rows: FeedRow[];
  /** Mints that arrived over SSE (drive the flash animation). */
  freshMints: Set<string>;
  connected: boolean;
  delaySeconds: number;
  refresh: () => Promise<void>;
}

/**
 * GET /api/feed for the initial page, then SSE /api/feed/live appends.
 * Pausing buffers events client-side and flushes on resume (prototype
 * behaviour); dossier-update events patch verdict/score in place.
 */
export function useLiveFeed(opts: LiveFeedOptions): LiveFeed {
  const { max, paused = false, onAdded, onDossierUpdate } = opts;
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [connected, setConnected] = useState(false);
  const [delaySeconds, setDelaySeconds] = useState(0);
  const freshMints = useRef<Set<string>>(new Set());
  const buffer = useRef<FeedRow[]>([]);
  const pausedRef = useRef(paused);
  const knownMints = useRef<Set<string>>(new Set());
  const addedRef = useRef(onAdded);
  const dossierRef = useRef(onDossierUpdate);
  addedRef.current = onAdded;
  dossierRef.current = onDossierUpdate;

  const addRows = useCallback(
    (incoming: FeedRow[], live: boolean): void => {
      const fresh = incoming.filter((r) => !knownMints.current.has(r.token.mint));
      if (fresh.length === 0) return;
      for (const r of fresh) {
        knownMints.current.add(r.token.mint);
        if (live) freshMints.current.add(r.token.mint);
        addedRef.current?.(r, live);
      }
      setRows((prev) => {
        const next = [...fresh, ...prev].slice(0, max);
        return next;
      });
    },
    [max],
  );

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/feed');
      if (!res.ok) return;
      const data = (await res.json()) as { rows: FeedRow[]; delaySeconds: number };
      setDelaySeconds(data.delaySeconds);
      knownMints.current = new Set(data.rows.map((r) => r.token.mint));
      setRows(data.rows.slice(0, max));
    } catch {
      /* feed stays empty; SSE may still connect */
    }
  }, [max]);

  // Pause / resume buffering.
  useEffect(() => {
    pausedRef.current = paused;
    if (!paused && buffer.current.length > 0) {
      const pending = buffer.current;
      buffer.current = [];
      addRows(pending.reverse(), true);
    }
  }, [paused, addRows]);

  useEffect(() => {
    void refresh();
    const es = new EventSource('/api/feed/live');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      let data: unknown;
      try {
        data = JSON.parse(msg.data as string);
      } catch {
        return;
      }
      if (data === null || typeof data !== 'object') return;
      const type = (data as { type?: string }).type;

      if (type === 'hello') {
        setDelaySeconds((data as { delaySeconds?: number }).delaySeconds ?? 0);
        return;
      }
      if (type === 'deploy') {
        const row = rowFromDeploy(data as DeployEvent);
        if (pausedRef.current) {
          buffer.current.unshift(row);
          if (buffer.current.length > max) buffer.current.pop();
        } else {
          addRows([row], true);
        }
        return;
      }
      if (type === 'dossier-update') {
        const e = data as DossierUpdateEvent;
        dossierRef.current?.(e);
        setRows((prev) =>
          prev.map((r) => {
            if (r.dev.wallet !== e.wallet) return r;
            return {
              token:
                e.mint === r.token.mint
                  ? {
                      ...r.token,
                      drScore: e.drScore,
                      bundlePct: e.bundlePct ?? r.token.bundlePct,
                      sniperLvl: e.sniperLvl ?? r.token.sniperLvl,
                    }
                  : r.token,
              dev: { ...r.dev, verdict: e.verdict },
            };
          }),
        );
      }
    };
    return () => es.close();
  }, [addRows, refresh, max]);

  return { rows, freshMints: freshMints.current, connected, delaySeconds, refresh };
}
