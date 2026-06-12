import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseWebhookPayload } from './parse';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const load = (f: string): unknown => JSON.parse(readFileSync(join(fixturesDir, f), 'utf8'));

describe('parseWebhookPayload — pump.fun creates', () => {
  it('parses create-1 (winner dev)', () => {
    const events = parseWebhookPayload(load('create-1.json'));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      mint: 'GiGABRA1NM1NTxxxxxxxxxxxxxxxxxxxxxxxxxxx1111',
      deployer: '7xKpW9fQmDEVWALLETxxxxxxxxxxxxxxxxxxxxx9fQm',
      name: 'Giga Brain',
      symbol: 'GIGABRAIN',
      slot: 312345678,
      venue: 'pumpfun',
    });
    expect(events[0]?.timestamp.toISOString()).toBe('2026-06-11T12:00:00.000Z');
  });

  it('parses create-2 and create-3', () => {
    expect(parseWebhookPayload(load('create-2.json'))[0]).toMatchObject({
      mint: 'E1ONA12M1NTxxxxxxxxxxxxxxxxxxxxxxxxxxxxx2222',
      deployer: 'Dk3rX2VnDEVWALLETxxxxxxxxxxxxxxxxxxxxxxxx2Vn',
      name: 'Elon AI 2',
      symbol: 'ELONAI2',
    });
    expect(parseWebhookPayload(load('create-3.json'))[0]).toMatchObject({
      mint: 'MoonCATM1NTxxxxxxxxxxxxxxxxxxxxxxxxxxxxx3333',
      deployer: '9mTwK4LpDEVWALLETxxxxxxxxxxxxxxxxxxxxxxxk4Lp',
      name: 'Moon Cat',
      symbol: 'MOONCAT',
    });
  });

  it('ignores swaps on the pump.fun program', () => {
    expect(parseWebhookPayload(load('swap-ignored.json'))).toHaveLength(0);
  });

  it('ignores creates from other programs/sources', () => {
    const events = parseWebhookPayload([
      {
        signature: 'sig',
        type: 'CREATE',
        source: 'METAPLEX',
        feePayer: 'abc',
        instructions: [{ programId: 'SomeOtherProgram1111111111111111111111111111' }],
        tokenTransfers: [{ mint: 'm' }],
      },
    ]);
    expect(events).toHaveLength(0);
  });

  it('falls back to Unknown name/symbol when the description is unparsable', () => {
    const events = parseWebhookPayload([
      {
        signature: 'sig2',
        slot: 1,
        timestamp: 1765971200,
        type: 'CREATE',
        source: 'PUMP_FUN',
        feePayer: 'devW',
        description: 'something weird',
        tokenTransfers: [{ mint: 'mintX' }],
      },
    ]);
    expect(events[0]).toMatchObject({ name: 'Unknown', symbol: 'UNKNOWN' });
  });

  it('drops creates with no resolvable mint', () => {
    const events = parseWebhookPayload([
      { signature: 's', type: 'CREATE', source: 'PUMP_FUN', feePayer: 'd', tokenTransfers: [] },
    ]);
    expect(events).toHaveLength(0);
  });
});
