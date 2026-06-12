import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  watchFindMany: vi.fn(),
  userFindMany: vi.fn(),
}));
const redisMock = vi.hoisted(() => ({
  set: vi.fn(async () => 'OK'),
  smembers: vi.fn(async () => [] as string[]),
}));

vi.mock('@devradar/db', () => ({
  prisma: {
    watch: { findMany: db.watchFindMany },
    user: { findMany: db.userFindMany },
  },
}));
vi.mock('../lib/redis', () => ({ redis: redisMock }));
vi.mock('../env', () => ({
  env: { APP_URL: 'http://localhost:3000', TELEGRAM_BOT_TOKEN: 'test' },
}));

import { dispatchAlert } from './dispatch';
import type { AlertJob } from '../lib/queues';
import type { Bot } from 'grammy';

function fakeBot(): { bot: Bot; sent: { chatId: string; text: string }[] } {
  const sent: { chatId: string; text: string }[] = [];
  const bot = {
    api: {
      sendMessage: vi.fn(async (chatId: string, text: string) => {
        sent.push({ chatId, text });
      }),
    },
  } as unknown as Bot;
  return { bot, sent };
}

const winnerDeploy: AlertJob = {
  mint: 'MINT1',
  symbol: 'NORTH',
  name: 'North Road Dog',
  ca: 'MINT1',
  devWallet: '7xKpW9fQmDEVWALLETxxxxxxxxxxxxxxxxxxxxx9fQm',
  verdict: 'WINNER',
  launchCount: 14,
  rugCount: 0,
  bestAthUsd: 4_200_000,
  bundlePct: 4.1,
  sniperLvl: 'LOW',
  drScore: 92,
};

const operatorWinnerOnly = {
  id: 'op1',
  tier: 'OPERATOR',
  tierExpires: new Date(Date.now() + 10 * 86_400_000),
  tgChatId: '1001',
  alertPrefs: { winnerOnly: true },
};

/**
 * Prompt-9 acceptance: Operator winner-only + Scout watchlist-only →
 * exactly the right messages.
 */
describe('dispatchAlert eligibility', () => {
  beforeEach(() => {
    db.watchFindMany.mockReset().mockResolvedValue([]);
    db.userFindMany.mockReset().mockResolvedValue([]);
    redisMock.set.mockClear();
    redisMock.smembers.mockReset().mockResolvedValue([]);
  });

  it('winner deploy → Operator (winner-only) gets it; Scout without watch does not', async () => {
    const { bot, sent } = fakeBot();
    db.userFindMany.mockResolvedValue([operatorWinnerOnly]); // tier filter excludes scouts
    await dispatchAlert(winnerDeploy, bot);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.chatId).toBe('1001');
    expect(sent[0]?.text).toContain('PROVEN DEPLOYER LIVE');
    expect(sent[0]?.text).toContain('DR Score 92');
    expect(sent[0]?.text).toContain('$NORTH');
  });

  it('fresh deploy → winner-only Operator stays silent', async () => {
    const { bot, sent } = fakeBot();
    db.userFindMany.mockResolvedValue([operatorWinnerOnly]);
    await dispatchAlert({ ...winnerDeploy, verdict: 'FRESH', drScore: 44 }, bot);
    expect(sent).toHaveLength(0);
  });

  it('scout watching the dev gets a watchlist alert on any deploy', async () => {
    const { bot, sent } = fakeBot();
    db.watchFindMany.mockResolvedValue([
      {
        userId: 'scout1',
        devWallet: winnerDeploy.devWallet,
        user: { id: 'scout1', tier: 'SCOUT', tierExpires: null, tgChatId: '2002', alertPrefs: {} },
      },
    ]);
    await dispatchAlert({ ...winnerDeploy, verdict: 'FRESH' }, bot);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.chatId).toBe('2002');
    expect(sent[0]?.text).toContain('WATCHLIST DEPLOYER LIVE');
  });

  it('watcher who is also Operator is not double-pinged', async () => {
    const { bot, sent } = fakeBot();
    db.watchFindMany.mockResolvedValue([
      {
        userId: 'op1',
        devWallet: winnerDeploy.devWallet,
        user: { ...operatorWinnerOnly, id: 'op1' },
      },
    ]);
    db.userFindMany.mockResolvedValue([operatorWinnerOnly]);
    await dispatchAlert(winnerDeploy, bot);
    expect(sent).toHaveLength(1);
  });

  it('minScore preference filters low-score deploys', async () => {
    const { bot, sent } = fakeBot();
    db.userFindMany.mockResolvedValue([
      { ...operatorWinnerOnly, alertPrefs: { winnerOnly: true, minScore: 85 } },
    ]);
    await dispatchAlert({ ...winnerDeploy, drScore: 80 }, bot);
    expect(sent).toHaveLength(0);
    await dispatchAlert({ ...winnerDeploy, drScore: 85 }, bot);
    expect(sent).toHaveLength(1);
  });

  it('expired Operator tier gets nothing', async () => {
    const { bot, sent } = fakeBot();
    db.userFindMany.mockResolvedValue([
      { ...operatorWinnerOnly, tierExpires: new Date(Date.now() - 1000) },
    ]);
    await dispatchAlert(winnerDeploy, bot);
    expect(sent).toHaveLength(0);
  });

  it('rug-link flag goes only to active-tier users who traced the dev', async () => {
    const { bot, sent } = fakeBot();
    redisMock.smembers.mockResolvedValue(['op1', 'scout1']);
    db.userFindMany.mockResolvedValue([
      operatorWinnerOnly,
      { id: 'scout1', tier: 'SCOUT', tierExpires: null, tgChatId: '2002', alertPrefs: {} },
    ]);
    await dispatchAlert({ ...winnerDeploy, kind: 'rug-link' }, bot);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.chatId).toBe('1001');
    expect(sent[0]?.text).toContain('RUG LINK FLAGGED');
  });
});
