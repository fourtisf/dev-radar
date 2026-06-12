import type { NextRequest } from 'next/server';
import { notifyBus } from '@/lib/bus';
import { globalIpLimit, SCOUT_FEED_DELAY_S } from '@/lib/limits';
import { effectiveTier, getSessionUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 25_000;
const SCOUT_BUFFER_MAX = 500;

/**
 * GET /api/feed/live — SSE stream backed by Postgres LISTEN/NOTIFY.
 * Events: {type:"deploy",…} and {type:"dossier-update",…}. SCOUT
 * connections receive deploys delayed by 5 minutes (tier gating).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const limited = await globalIpLimit(req);
  if (limited) return limited;

  const user = await getSessionUser();
  const tier = effectiveTier(user);
  const delayMs = tier === 'SCOUT' ? SCOUT_FEED_DELAY_S * 1000 : 0;

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown): void => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };

      send({ type: 'hello', tier, delaySeconds: delayMs / 1000 });

      unsubscribe = notifyBus.subscribe(({ payload }) => {
        if (payload === null || typeof payload !== 'object') return;
        const type = (payload as { type?: string }).type;
        if (type === 'deploy' && delayMs > 0) {
          if (pendingTimers.size >= SCOUT_BUFFER_MAX) return;
          const t = setTimeout(() => {
            pendingTimers.delete(t);
            send(payload);
          }, delayMs);
          pendingTimers.add(t);
          return;
        }
        send(payload);
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: hb ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);

      const cleanup = (): void => {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        unsubscribe?.();
        unsubscribe = null;
        for (const t of pendingTimers) clearTimeout(t);
        pendingTimers.clear();
      };

      req.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
      for (const t of pendingTimers) clearTimeout(t);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx: do not buffer SSE
    },
  });
}
