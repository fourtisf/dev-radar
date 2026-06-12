import { setTimeout as sleep } from 'node:timers/promises';
import type { Bot } from 'grammy';
import { prisma } from '@devradar/db';
import { redis } from '../lib/redis';
import type { AlertJob } from '../lib/queues';
import { readPrefs } from './bot';
import { rugLinkMessage, watchlistDeployMessage, winnerDeployMessage } from './templates';

/** Users who traced a dev recently (set by web /api/trace, TTL 7d). */
export const tracedDevKey = (wallet: string): string => `traced:dev:${wallet}`;

function tierActive(tier: string, tierExpires: Date | null): boolean {
  if (tier === 'SCOUT') return false;
  return tierExpires === null || tierExpires.getTime() > Date.now();
}

/**
 * Per-chat throttle: max 1 msg/sec/chat (Telegram limit). Holds a
 * Redis lock keyed on the chat; waits politely instead of dropping.
 */
async function sendThrottled(bot: Bot, chatId: string, html: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const ok = await redis.set(`tg:rl:${chatId}`, '1', 'PX', 1000, 'NX');
    if (ok) {
      await bot.api.sendMessage(chatId, html, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
      return;
    }
    await sleep(250);
  }
  throw new Error(`throttle window never opened for chat ${chatId}`);
}

/**
 * `alerts` consumer: fan a deploy (or rug-link flag) out to eligible
 * users — tier + prefs + watchlist (handoff Section 10).
 */
export async function dispatchAlert(job: AlertJob, bot: Bot | null): Promise<void> {
  if (!bot) return; // no TELEGRAM_BOT_TOKEN configured

  if (job.kind === 'rug-link') {
    const userIds = await redis.smembers(tracedDevKey(job.devWallet));
    if (userIds.length === 0) return;
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, tgChatId: { not: null } },
    });
    for (const u of users) {
      if (!tierActive(u.tier, u.tierExpires)) continue; // Operator+ only
      await sendThrottled(bot, u.tgChatId!, rugLinkMessage(job));
    }
    return;
  }

  // 1) Watchlist deploys — any tier with that dev followed.
  const watchers = await prisma.watch.findMany({
    where: { devWallet: job.devWallet },
    include: { user: true },
  });
  const watcherIds = new Set<string>();
  for (const w of watchers) {
    if (!w.user.tgChatId) continue;
    watcherIds.add(w.userId);
    await sendThrottled(bot, w.user.tgChatId, watchlistDeployMessage(job));
  }

  // 2) Broadcast deploys — Operator+ subject to prefs.
  const paid = await prisma.user.findMany({
    where: { tgChatId: { not: null }, tier: { in: ['OPERATOR', 'SYNDICATE'] } },
  });
  for (const u of paid) {
    if (watcherIds.has(u.id)) continue; // already pinged via watchlist
    if (!tierActive(u.tier, u.tierExpires)) continue;
    const prefs = readPrefs(u.alertPrefs);
    if (prefs.watchlistOnly) continue;
    if (prefs.winnerOnly && job.verdict !== 'WINNER') continue;
    if (prefs.minScore !== undefined && job.drScore < prefs.minScore) continue;
    await sendThrottled(bot, u.tgChatId!, winnerDeployMessage(job));
  }
}
