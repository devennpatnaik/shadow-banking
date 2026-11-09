import { describe, expect, it } from 'vitest';
import { d } from '@shadow-banking/core';
import { buildSeed1kFixture } from '../src/fixture.js';
import { buildPerformanceReport } from '../src/performance.js';
import { recommendRetainedEarnings } from '../src/allocate.js';

describe('$1k seed fixture', () => {
  it('reconciles NAV to assets minus liabilities and excludes borrow/transfers from P&L', () => {
    const l = buildSeed1kFixture();
    expect(l.nav().eq(l.grossAssets().minus(l.totalDebt()))).toBe(true);
    expect(l.nav().eq(l.netContributed().plus(l.netPnl()))).toBe(true);
    expect(l.initialEquity().toString()).toBe('1000');
    expect(l.withdrawals().toString()).toBe('25');
    expect(l.depositsAfterSeed().toString()).toBe('0');
    expect(l.balance('borrow_principal').gt(0)).toBe(true);
    expect(l.balance('staking_income').gt(0)).toBe(true);
    expect(l.balance('lending_income').gt(0)).toBe(true);
    expect(l.balance('funding_income').gt(0)).toBe(true);
    expect(l.balance('lp_income').gt(0)).toBe(true);
    expect(l.balance('incentives').gt(0)).toBe(true);
    expect(l.balance('fees').gt(0)).toBe(true);
    expect(l.balance('financing_cost').gt(0)).toBe(true);
    expect(l.getEntries().some((e) => e.kind === 'borrow')).toBe(true);
    expect(l.getEntries().some((e) => e.kind === 'transfer')).toBe(true);
    const borrowUsd = l
      .getEntries()
      .filter((e) => e.kind === 'borrow')
      .reduce((s, e) => s.plus(e.lines.filter((ln) => ln.side === 'debit')[0]!.amount), d(0));
    expect(l.netPnl().lt(borrowUsd)).toBe(true);
  });

  it('reports labeled annualized estimates, drawdown, and liquidation exposure', () => {
    const report = buildPerformanceReport(buildSeed1kFixture());
    expect(report.netAnnualizedYieldKind).toBe('estimate');
    expect(report.annualizationAssumptions).toMatch(/ESTIMATE|estimate/i);
    expect(report.figuresNote).toMatch(/not profit/i);
    expect(report.hurdleApy.toString()).toBe('0.1');
    expect(report.periodDays).toBe(89);
    expect(report.maxDrawdown.lte(0)).toBe(true);
    expect(report.maxDrawdown.lt(0)).toBe(true);
    expect(report.liquidationExposure.worstHealthFactor).not.toBeNull();
    expect(report.liquidReserves.gt(0)).toBe(true);
    expect(report.totalDebt.gt(0)).toBe(true);
    expect(
      report.netPnl.minus(report.realizedPnl.plus(report.unrealizedPnl)).abs().lt('1e-18'),
    ).toBe(true);
  });

  it('allocator stub on the fixture is recommendation-only', () => {
    const l = buildSeed1kFixture();
    const report = buildPerformanceReport(l);
    const rec = recommendRetainedEarnings({
      netEarnings: report.realizedPnl,
      riskState: 'Normal',
      nav: report.nav,
      debt: report.totalDebt,
      liquidReserves: report.liquidReserves,
      reserveRequired: report.nav.mul('0.20'),
      upcomingExpenses: d(0),
      liquidationDistance: report.liquidationExposure.worstLiquidationDistance,
      hurdleApy: d('0.10'),
      estimatedNetYieldApy: report.netAnnualizedYield,
    });
    expect(rec.executes).toBe(false);
    expect(rec.totalAllocated.eq(report.realizedPnl)).toBe(true);
  });
});
