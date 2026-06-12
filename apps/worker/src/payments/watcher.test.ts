import { describe, expect, it } from 'vitest';
import { matchTierByAmount, MEMO_RE } from './watcher';

describe('payment matching — handoff Section 11', () => {
  it('matches exact tier amounts', () => {
    expect(matchTierByAmount(2)).toBe('OPERATOR');
    expect(matchTierByAmount(8)).toBe('SYNDICATE');
  });

  it('accepts ±2% tolerance', () => {
    expect(matchTierByAmount(1.96)).toBe('OPERATOR');
    expect(matchTierByAmount(2.04)).toBe('OPERATOR');
    expect(matchTierByAmount(8.16)).toBe('SYNDICATE');
    expect(matchTierByAmount(7.84)).toBe('SYNDICATE');
  });

  it('rejects amounts outside tolerance', () => {
    expect(matchTierByAmount(1.9)).toBeNull();
    expect(matchTierByAmount(2.1)).toBeNull();
    expect(matchTierByAmount(5)).toBeNull();
    expect(matchTierByAmount(0)).toBeNull();
  });

  it('memo format DR-<userId>', () => {
    expect(MEMO_RE.exec('DR-clxyz123abc')?.[1]).toBe('clxyz123abc');
    expect(MEMO_RE.exec('DR-')).toBeNull();
    expect(MEMO_RE.exec('dr-clxyz')).toBeNull();
    expect(MEMO_RE.exec('payment for sub')).toBeNull();
  });
});
