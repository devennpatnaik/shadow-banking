import { describe, expect, it } from 'vitest';
import { d } from '@shadow-banking/core';
import { recommendRetainedEarnings } from '../src/allocate.js';

const base = {
  netEarnings: d(10),
  nav: d(1000),
  debt: d(150),
  liquidReserves: d(200),
  reserveRequired: d(200),
  upcomingExpenses: d(0),
  liquidationDistance: d('0.40'),
  hurdleApy: d('0.10'),
  estimatedNetYieldApy: d('0.03'),
};

describe('retained-earnings allocator stub', () => {
  it('does not execute and holds liquid when estimated yield is below the hurdle', () => {
    const r = recommendRetainedEarnings({
      ...base,
      riskState: 'Normal',
      estimatedNetYieldApy: d('0.03'),
    });
    expect(r.executes).toBe(false);
    expect(r.kind).toBe('recommendation');
    expect(r.uses.every((u) => u.use === 'raise_reserves')).toBe(true);
    expect(r.holdLiquid).toBe(true);
  });

  it('recommends repay and reserves in Emergency, never yield assets', () => {
    const r = recommendRetainedEarnings({
      ...base,
      riskState: 'Emergency',
      estimatedNetYieldApy: d('0.20'),
    });
    expect(r.uses.map((u) => u.use)).toEqual(['repay_debt']);
    expect(r.uses.some((u) => u.use === 'buy_yield_assets')).toBe(false);
    expect(r.totalAllocated.toString()).toBe('10');
  });

  it('funds expenses first in Normal when they are due', () => {
    const r = recommendRetainedEarnings({
      ...base,
      riskState: 'Normal',
      upcomingExpenses: d(4),
      estimatedNetYieldApy: null,
    });
    expect(r.uses[0]?.use).toBe('fund_expenses');
    expect(r.uses[0]?.amount.toString()).toBe('4');
  });

  it('returns no slices when earnings are negative', () => {
    const r = recommendRetainedEarnings({ ...base, netEarnings: d('-5'), riskState: 'Caution' });
    expect(r.uses).toHaveLength(0);
    expect(r.totalAllocated.toString()).toBe('0');
  });
});
