import { describe, expect, it } from 'vitest';
import { ZERO } from '../src/money.js';
import { usesOfCapital } from '../src/uses.js';
import { expectDec, fixtureBalanceSheet } from './fixtures.js';

describe('usesOfCapital', () => {
  it('lists multiple uses on pledged yield-bearing collateral without double-counting equity', () => {
    const report = usesOfCapital(fixtureBalanceSheet());
    expectDec(report.ownerEquityUsd, '7300');
    expectDec(report.borrowedCapitalUsd, '1600');
    const wst = report.assets.find((a) => a.symbol === 'wstETH');
    if (!wst) throw new Error('missing wstETH');
    expectDec(wst.fairValue, '2400');
    expect(wst.uses).toEqual(['productive_yield', 'collateral', 'borrowed_against']);
    const attributed = report.assets.reduce((s, a) => s.plus(a.ownerEquityUsd), ZERO);
    expectDec(attributed, '7300');
    const borrowedOnAssets = report.assets.reduce((s, a) => s.plus(a.borrowedUsd), ZERO);
    expectDec(borrowedOnAssets, '1600');
  });
});
