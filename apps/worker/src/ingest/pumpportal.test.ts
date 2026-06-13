import { describe, expect, it } from 'vitest';
import { parsePumpPortal } from './pumpportal';

describe('parsePumpPortal', () => {
  it('maps a new-token create message to a LaunchEvent', () => {
    const ev = parsePumpPortal({
      signature: 'sigABC',
      mint: 'MiNTpump111111111111111111111111111111111111',
      traderPublicKey: 'DeVwa11et2222222222222222222222222222222222',
      txType: 'create',
      name: 'Giga Brain',
      symbol: 'gigabrain',
      marketCapSol: 31.2,
    });
    expect(ev).toMatchObject({
      signature: 'sigABC',
      mint: 'MiNTpump111111111111111111111111111111111111',
      deployer: 'DeVwa11et2222222222222222222222222222222222',
      name: 'Giga Brain',
      symbol: 'GIGABRAIN',
      venue: 'pumpfun',
    });
  });

  it('ignores trade/non-create messages', () => {
    expect(parsePumpPortal({ txType: 'buy', mint: 'm', traderPublicKey: 'w' })).toBeNull();
  });

  it('skips messages missing mint or creator', () => {
    expect(parsePumpPortal({ txType: 'create', mint: 'm' })).toBeNull();
    expect(parsePumpPortal({ txType: 'create', traderPublicKey: 'w' })).toBeNull();
    expect(parsePumpPortal('garbage')).toBeNull();
  });

  it('falls back to Unknown name/symbol and a synthetic signature', () => {
    const ev = parsePumpPortal({
      mint: 'MiNT',
      creator: 'WALLET',
      type: 'create',
    });
    expect(ev).toMatchObject({ name: 'Unknown', symbol: 'UNKNOWN', signature: 'pp-MiNT' });
  });
});
