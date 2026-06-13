import { Bot, InlineKeyboard, type Context } from 'grammy';
import { prisma, type Dev, type Token } from '@devradar/db';
import { env } from '../env';
import { redis } from '../lib/redis';
import { fmtUsd, shortAddr, VERDICT_LABEL } from './templates';

/** Redis key where the auto-captured broadcast channel id is stored. */
export const ALERT_CHANNEL_KEY = 'alert:channel';

/** Reply as HTML with link previews off (matches the alert formatting). */
function reply(ctx: Context, text: string): Promise<unknown> {
  return ctx.reply(text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
}

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

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** The DevRadar command menu (replaces any old commands on the bot). */
const COMMANDS: { command: string; description: string }[] = [
  { command: 'trace', description: 'Trace a CA or deployer wallet' },
  { command: 'feed', description: 'Latest pump.fun launches' },
  { command: 'winners', description: 'Top proven deployers' },
  { command: 'flagged', description: 'Recently flagged ruggers' },
  { command: 'settings', description: 'Alert preferences' },
  { command: 'status', description: 'Your tier & link status' },
  { command: 'start', description: 'Link your wallet for alerts' },
  { command: 'help', description: 'What this bot does' },
];

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

function rugRatePct(dev: Dev): string {
  return dev.launchCount > 0 ? `${Math.round((dev.rugCount / dev.launchCount) * 100)}%` : '—';
}

/** One-line dossier summary used by /trace, /feed, /winners, /flagged. */
function devSummary(dev: Dev, token?: Token | null): string {
  const verdict = VERDICT_LABEL[dev.verdict] ?? dev.verdict;
  const head = token ? `<b>$${token.symbol}</b> — ${token.name}\n` : '';
  const score = token ? token.drScore : 50;
  const bundle = token ? Number(token.bundlePct) : 0;
  return (
    `${head}Dev <code>${shortAddr(dev.wallet)}</code> · ${verdict}\n` +
    `${dev.launchCount} launches · ${rugRatePct(dev)} rug · best ATH ${fmtUsd(Number(dev.bestAthUsd))}\n` +
    `Bundle ${bundle}% · DR Score ${score} · funding ${dev.fundingType.toLowerCase()}`
  );
}

const HELP =
  '<b>DevRadar</b> — deployer intelligence for Solana.\n\n' +
  '/trace <code>&lt;CA|wallet&gt;</code> — full dossier in seconds\n' +
  '/feed — latest pump.fun launches\n' +
  '/winners — top proven deployers\n' +
  '/flagged — recently flagged ruggers\n' +
  '/settings — tune your alerts\n' +
  '/status — your account\n\n' +
  'Link alerts: open the terminal → <b>Set alert</b> → send the code here.';

/** grammY bot: account linking, alert settings, and read-only lookups. */
export function createBot(): Bot | null {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  // ── /start <code> — link account ──────────────────────────────
  bot.command('start', async (ctx) => {
    const code = ctx.match?.trim();
    if (!code) {
      await reply(ctx, HELP);
      return;
    }
    const user = await prisma.user.findUnique({ where: { tgLinkCode: code } });
    if (!user) {
      await reply(ctx, 'Code not recognized (codes are one-time). Generate a new one in the terminal.');
      return;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { tgChatId: String(ctx.chat.id), tgLinkCode: null },
    });
    await reply(ctx, `● Linked to <code>${shortAddr(user.wallet)}</code>\nTier: ${user.tier}\n\n/settings to tune alerts.`);
  });

  bot.command('help', (ctx) => reply(ctx, HELP));

  // ── /status — account + prefs ─────────────────────────────────
  bot.command('status', async (ctx) => {
    const user = await prisma.user.findUnique({ where: { tgChatId: String(ctx.chat.id) } });
    if (!user) {
      await reply(ctx, 'Not linked. Open the terminal → Set alert → send /start &lt;code&gt; here.');
      return;
    }
    const prefs = readPrefs(user.alertPrefs);
    const expiry = user.tierExpires ? ` (until ${user.tierExpires.toISOString().slice(0, 10)})` : '';
    await reply(
      ctx,
      `<b>Account</b>\nWallet <code>${shortAddr(user.wallet)}</code>\nTier: ${user.tier}${expiry}\n` +
        `Alerts: ${prefs.winnerOnly ? 'winners only' : 'all'}` +
        `${prefs.minScore ? ` · DR ≥ ${prefs.minScore}` : ''}` +
        `${prefs.watchlistOnly ? ' · watchlist only' : ''}`,
    );
  });

  // ── /feed — latest launches ───────────────────────────────────
  bot.command('feed', async (ctx) => {
    const tokens = await prisma.token.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { dev: true },
    });
    if (tokens.length === 0) {
      await reply(ctx, 'No launches indexed yet — the feed fills the moment pump.fun mints.');
      return;
    }
    const lines = tokens.map(
      (t) =>
        `<b>$${t.symbol}</b> · ${VERDICT_LABEL[t.dev.verdict] ?? t.dev.verdict} · DR ${t.drScore} · ${shortAddr(t.devWallet)}`,
    );
    await reply(ctx, `<b>Latest launches</b>\n${lines.join('\n')}`);
  });

  // ── /winners and /flagged — leaderboards ──────────────────────
  bot.command('winners', async (ctx) => {
    const devs = await prisma.dev.findMany({
      where: { verdict: 'WINNER' },
      orderBy: { bestAthUsd: 'desc' },
      take: 5,
    });
    if (devs.length === 0) {
      await reply(ctx, 'No proven winners indexed yet — the board fills as outcomes resolve over time.');
      return;
    }
    const lines = devs.map(
      (d) => `<code>${shortAddr(d.wallet)}</code> · ${d.launchCount} launches · best ATH ${fmtUsd(Number(d.bestAthUsd))}`,
    );
    await reply(ctx, `<b>Top proven deployers</b>\n${lines.join('\n')}`);
  });

  bot.command('flagged', async (ctx) => {
    const devs = await prisma.dev.findMany({
      where: { verdict: 'RUGGER' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    if (devs.length === 0) {
      await reply(ctx, 'No flagged ruggers yet — they surface as rugs resolve from price action.');
      return;
    }
    const lines = devs.map(
      (d) => `<code>${shortAddr(d.wallet)}</code> · ${d.launchCount} launches · ${rugRatePct(d)} rug`,
    );
    await reply(ctx, `<b>Flagged ruggers</b>\n${lines.join('\n')}`);
  });

  // ── /trace <CA|wallet> — dossier summary ──────────────────────
  bot.command('trace', async (ctx) => {
    const q = ctx.match?.trim();
    if (!q) {
      await reply(ctx, 'Usage: /trace &lt;CA or deployer wallet&gt;');
      return;
    }
    if (!BASE58_RE.test(q)) {
      await reply(ctx, 'That does not look like a Solana address. Paste a CA or wallet.');
      return;
    }
    const token = await prisma.token.findUnique({ where: { mint: q }, include: { dev: true } });
    if (token) {
      await reply(ctx, devSummary(token.dev, token));
      return;
    }
    const dev = await prisma.dev.findUnique({ where: { wallet: q } });
    if (dev) {
      const latest = await prisma.token.findFirst({
        where: { devWallet: q },
        orderBy: { createdAt: 'desc' },
      });
      await reply(ctx, devSummary(dev, latest));
      return;
    }
    await reply(ctx, 'Not indexed yet. Open it in the terminal at devradar.org/app to trace it cold.');
  });

  // ── /settings — inline keyboard ───────────────────────────────
  bot.command('settings', async (ctx) => {
    const user = await prisma.user.findUnique({ where: { tgChatId: String(ctx.chat.id) } });
    if (!user) {
      await reply(ctx, 'Not linked yet — get a code from the terminal and send /start &lt;code&gt;.');
      return;
    }
    await ctx.reply('Alert settings', { reply_markup: settingsKeyboard(readPrefs(user.alertPrefs)) });
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

  // ── Auto-capture the broadcast channel ────────────────────────
  // The bot is added as admin to a channel; the first post there tells
  // us its numeric id, which alerts then mirror to. (ALERT_CHANNEL_ID
  // env overrides this.)
  bot.on('channel_post', async (ctx) => {
    const id = String(ctx.chat.id);
    const prev = await redis.get(ALERT_CHANNEL_KEY);
    await redis.set(ALERT_CHANNEL_KEY, id);
    // stdout → visible in `docker compose logs worker`
    console.log(`[bot] broadcast channel captured: ${id} (${ctx.chat.title ?? ''})`);
    if (prev !== id) {
      try {
        await ctx.reply('✅ DevRadar alerts connected to this channel.');
      } catch {
        /* ignore — bot may lack post permission */
      }
    }
  });

  // Also capture when the bot is (re)added as an admin to a channel.
  bot.on('my_chat_member', async (ctx) => {
    const chat = ctx.myChatMember?.chat;
    const status = ctx.myChatMember?.new_chat_member?.status;
    if (chat?.type === 'channel' && (status === 'administrator' || status === 'member')) {
      await redis.set(ALERT_CHANNEL_KEY, String(chat.id));
      console.log(`[bot] broadcast channel set via admin add: ${chat.id}`);
    }
  });

  // Replace whatever command menu the bot had (e.g. an old project's)
  // with the DevRadar set, for every chat scope Telegram caches.
  void bot.api.setMyCommands(COMMANDS).catch(() => undefined);
  void bot.api
    .setMyCommands(COMMANDS, { scope: { type: 'all_private_chats' } })
    .catch(() => undefined);

  return bot;
}
