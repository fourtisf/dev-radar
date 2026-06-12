import { Bot, InlineKeyboard } from 'grammy';
import { prisma } from '@devradar/db';
import { env } from '../env';

export interface AlertPrefs {
  winnerOnly: boolean;
  minScore?: number;
  watchlistOnly?: boolean;
}

export function readPrefs(raw: unknown): AlertPrefs {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    winnerOnly: p['winnerOnly'] !== false,
    minScore: typeof p['minScore'] === 'number' ? p['minScore'] : undefined,
    watchlistOnly: p['watchlistOnly'] === true,
  };
}

function settingsKeyboard(prefs: AlertPrefs): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text(`Winner-only: ${prefs.winnerOnly ? 'ON ✓' : 'OFF'}`, `set:winnerOnly:${prefs.winnerOnly ? 0 : 1}`).row();
  for (const v of [50, 70, 85]) {
    kb.text(`${prefs.minScore === v ? '● ' : ''}DR ≥ ${v}`, `set:minScore:${v}`);
  }
  kb.text(`${prefs.minScore === undefined ? '● ' : ''}Any DR`, 'set:minScore:0').row();
  kb.text(
    `Watchlist-only: ${prefs.watchlistOnly ? 'ON ✓' : 'OFF'}`,
    `set:watchlistOnly:${prefs.watchlistOnly ? 0 : 1}`,
  );
  return kb;
}

/** grammY bot: /start <code> linking + /settings inline keyboard. */
export function createBot(): Bot | null {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command('start', async (ctx) => {
    const code = ctx.match?.trim();
    if (!code) {
      await ctx.reply(
        'DevRadar alerts.\n\nLink your account: open the terminal → Set alert → send the code here as /start <code>.',
      );
      return;
    }
    const user = await prisma.user.findUnique({ where: { tgLinkCode: code } });
    if (!user) {
      await ctx.reply('Code not recognized (codes are one-time and expire on use). Generate a new one in the terminal.');
      return;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { tgChatId: String(ctx.chat.id), tgLinkCode: null },
    });
    await ctx.reply(
      `● Linked to ${user.wallet.slice(0, 4)}····${user.wallet.slice(-4)}\nTier: ${user.tier}\n\n/settings to tune alerts.`,
    );
  });

  bot.command('settings', async (ctx) => {
    const user = await prisma.user.findUnique({ where: { tgChatId: String(ctx.chat.id) } });
    if (!user) {
      await ctx.reply('Not linked yet — get a code from the terminal and send /start <code>.');
      return;
    }
    const prefs = readPrefs(user.alertPrefs);
    await ctx.reply('Alert settings', { reply_markup: settingsKeyboard(prefs) });
  });

  bot.callbackQuery(/^set:(winnerOnly|minScore|watchlistOnly):(\d+)$/, async (ctx) => {
    const user = await prisma.user.findUnique({ where: { tgChatId: String(ctx.chat?.id) } });
    if (!user) {
      await ctx.answerCallbackQuery({ text: 'Not linked.' });
      return;
    }
    const [, key, valueRaw] = ctx.match;
    const value = Number(valueRaw);
    const prefs = readPrefs(user.alertPrefs);
    if (key === 'winnerOnly') prefs.winnerOnly = value === 1;
    if (key === 'watchlistOnly') prefs.watchlistOnly = value === 1;
    if (key === 'minScore') prefs.minScore = value === 0 ? undefined : value;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        alertPrefs: {
          winnerOnly: prefs.winnerOnly,
          ...(prefs.minScore !== undefined ? { minScore: prefs.minScore } : {}),
          ...(prefs.watchlistOnly ? { watchlistOnly: true } : {}),
        },
      },
    });
    await ctx.editMessageReplyMarkup({ reply_markup: settingsKeyboard(prefs) });
    await ctx.answerCallbackQuery({ text: 'Saved.' });
  });

  return bot;
}
