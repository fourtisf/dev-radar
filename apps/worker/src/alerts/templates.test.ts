import { describe, expect, it, vi } from 'vitest';

vi.mock('../env', () => ({ env: { APP_URL: 'https://devradar.example' } }));

import { fmtUsd, shortAddr, winnerDeployMessage } from './templates';
import type { AlertJob } from '../lib/queues';

const job: AlertJob = {
  mint: 'MINTNORTH',
  symbol: 'NORTH',
  name: 'North Road Dog',
  ca: 'MINTNORTH',
  devWallet: '7xKpW9fQmDEVWALLETxxxxxxxxxxxxxxxxxxxxx9fQm',
  verdict: 'WINNER',
  launchCount: 14,
  rugCount: 0,
  bestAthUsd: 4_200_000,
  bundlePct: 4.1,
  sniperLvl: 'LOW',
  drScore: 92,
};

describe('telegram templates — prototype TG mockup', () => {
  it('winner deploy carries every line of the mockup', () => {
    const msg = winnerDeployMessage(job);
    expect(msg).toContain('● PROVEN DEPLOYER LIVE');
    expect(msg).toContain('<b>$NORTH</b> — North Road Dog');
    expect(msg).toContain(
      'Dev <a href="https://solscan.io/account/7xKpW9fQmDEVWALLETxxxxxxxxxxxxxxxxxxxxx9fQm">7xKp····9fQm</a> · Serial Winner',
    );
    expect(msg).toContain('14 launches · 0 rugs · best ATH $4.2M');
    expect(msg).toContain('Bundle 4.1% · Snipers low · DR Score 92');
    expect(msg).toContain('dossier');
    expect(msg).toContain('https://devradar.example/app?dev=7xKp');
  });

  it('helpers format like the prototype', () => {
    expect(shortAddr('7xKpW9fQmDEVWALLETxxxxxxxxxxxxxxxxxxxxx9fQm')).toBe('7xKp····9fQm');
    expect(fmtUsd(4_200_000)).toBe('$4.2M');
    expect(fmtUsd(860_000)).toBe('$860K');
    expect(fmtUsd(310)).toBe('$310');
  });
});
