import { describe, it, expect } from 'vitest';
import { d } from '@shadow-banking/core';
import { aaveMarket, correlatedStoppingRule } from '../src/defaults.js';
import { zeroCost } from '../src/costs.js';
import { simulateLoop } from '../src/loop.js';
import type { SimulationInput } from '../src/types.js';

function input(patch: Partial<SimulationInput> = {}): SimulationInput {
  return {
    label: 'unit',
    snapshotDate: 'test',
    seedUsd: d(1000),
    reserveRate: d(0),
    reserveYieldApy: d(0),
    horizonDays: 365,
    collateral: { symbol: 'C', priceUsd: d(1), yieldApy: d('0.10'), volatility: d('0.05') },
    borrow: { symbol: 'D', priceUsd: d(1), variableBorrowApy: d('0.02') },
    market: aaveMarket({
      protocol: 'test',
      network: 'test',
      ltv: '0.5',
      liquidationThreshold: '0.8',
      liquidationBonus: '0.05',
      eMode: false,
    }),
    costs: zeroCost(),
    policy: { kind: 'fixed', loops: 2 },
    stopping: {
      ...correlatedStoppingRule(),
      minHealthFactor: d('1.05'),
      postActionHfBuffer: d(0),
      smallPositionHfBuffer: d(0),
      maxLeverage: d(10),
      minPriceDropToLiquidation: d(0),
      maxLiquidationProbability: d(1),
    },
    includeUnwindCosts: false,
    notes: [],
    ...patch,
  };
}

describe('loop math (hand-checked, zero costs)', () => {
  it('step 0: $1,000 collateral, 10% yield, no debt', () => {
    const r = simulateLoop(input({ policy: { kind: 'fixed', loops: 0 } }));
    const s = r.steps[0]!;
    expect(s.collateralUsd.toString()).toBe('1000');
    expect(s.debtUsd.toString()).toBe('0');
    expect(s.grossIncomeUsd.toString()).toBe('100');
    expect(s.interestExpenseUsd.toString()).toBe('0');
    expect(s.netRoe.toString()).toBe('0.1');
    expect(s.risk.healthFactor).toBeNull();
  });

  it('loop 1: borrow 500, collateral 1500, income 150, interest 10, net 140, HF 2.4', () => {
    const r = simulateLoop(input({ policy: { kind: 'fixed', loops: 1 } }));
    const s = r.steps[1]!;
    expect(s.borrowedThisStep.toString()).toBe('500');
    expect(s.collateralUsd.toString()).toBe('1500');
    expect(s.debtUsd.toString()).toBe('500');
    expect(s.grossIncomeUsd.toString()).toBe('150');
    expect(s.interestExpenseUsd.toString()).toBe('10');
    expect(s.netIncomeUsd.toString()).toBe('140');
    expect(s.netRoe.toString()).toBe('0.14');
    expect(s.risk.healthFactor?.toString()).toBe('2.4'); // 1500*0.8/500
    expect(s.risk.priceDropToLiquidation?.toFixed(10)).toBe('0.5833333333'); // 1 - 1/2.4
    expect(s.marginal.additionalProductiveAssetsUsd.toString()).toBe('500');
    expect(s.marginal.additionalRecurringIncomeUsd.toString()).toBe('50');
    expect(s.marginal.additionalInterestExpenseUsd.toString()).toBe('10');
    expect(s.marginal.incrementalRoe.toString()).toBe('0.04'); // 40 extra net / 1000 equity
  });

  it('loop 2: remaining capacity is 1500×0.5−500=250 (geometric, not a fresh 50% of the book)', () => {
    const r = simulateLoop(input({ policy: { kind: 'fixed', loops: 2 } }));
    const s = r.steps[2]!;
    expect(s.borrowedThisStep.toString()).toBe('250');
    expect(s.collateralUsd.toString()).toBe('1750');
    expect(s.debtUsd.toString()).toBe('750');
    expect(s.grossIncomeUsd.toString()).toBe('175');
    expect(s.interestExpenseUsd.toString()).toBe('15');
    expect(s.netIncomeUsd.toString()).toBe('160');
    expect(s.leverage.toString()).toBe('1.75');
    expect(s.risk.healthFactor?.toFixed(4)).toBe('1.8667'); // 1750×0.8/750
  });
});

describe('stopping rule', () => {
  it('optimal stops when the next loop misses the hurdle and does not raise net yield', () => {
    const r = simulateLoop(
      input({
        policy: { kind: 'optimal' },
        collateral: { symbol: 'C', priceUsd: d(1), yieldApy: d('0.03'), volatility: d('0.05') },
        borrow: { symbol: 'D', priceUsd: d(1), variableBorrowApy: d('0.025') },
        stopping: {
          ...correlatedStoppingRule(d('0.10')),
          minHealthFactor: d('1.05'),
          postActionHfBuffer: d(0),
          smallPositionHfBuffer: d(0),
          maxLeverage: d(10),
          minPriceDropToLiquidation: d(0),
          maxLiquidationProbability: d(1),
        },
      }),
    );
    expect(r.recommendation.action).toBe('hold-liquid');
    expect(r.stopReason === 'marginal-economics-unattractive' || r.recommendation.loops === 0).toBe(
      true,
    );
  });

  it('optimal keeps looping while incremental ROE clears the hurdle', () => {
    const r = simulateLoop(
      input({
        policy: { kind: 'optimal' },
        stopping: {
          ...correlatedStoppingRule(d('0.01')),
          minHealthFactor: d('1.05'),
          postActionHfBuffer: d(0),
          smallPositionHfBuffer: d(0),
          maxLeverage: d(10),
          minPriceDropToLiquidation: d(0),
          maxLiquidationProbability: d(1),
        },
      }),
    );
    expect(r.recommendation.loops).toBeGreaterThan(0);
    expect(r.steps.length).toBeGreaterThan(1);
  });

  it('stops on a health-factor floor', () => {
    const r = simulateLoop(
      input({
        policy: { kind: 'optimal' },
        stopping: {
          ...correlatedStoppingRule(d('0.01')),
          minHealthFactor: d('2.0'),
          postActionHfBuffer: d(0),
          smallPositionHfBuffer: d(0),
          maxLeverage: d(10),
          minPriceDropToLiquidation: d(0),
          maxLiquidationProbability: d(1),
        },
      }),
    );
    // loop 1 HF = 2.4 (ok), loop 2 HF = 1.44 (rejected)
    expect(r.stopReason).toBe('risk-limit');
    expect(r.steps[r.steps.length - 1]!.index).toBe(1);
  });

  it('target LTV stops at the requested ratio', () => {
    const r = simulateLoop(input({ policy: { kind: 'targetLtv', targetLtv: d('0.4') } }));
    const last = r.steps[r.steps.length - 1]!;
    expect(last.ltv.lte('0.401')).toBe(true);
    expect(r.stopReason === 'target-ltv-reached' || last.ltv.gte('0.39')).toBe(true);
  });
});

describe('Aave v3.3 small-position rule', () => {
  it('flags a $1,000 position as fully liquidatable in one call and raises the HF floor', () => {
    const r = simulateLoop(input({ policy: { kind: 'fixed', loops: 1 } }));
    const s = r.steps[1]!;
    expect(s.risk.smallPosition).toBe(true);
    expect(s.risk.fullyLiquidatableInOneCall).toBe(true);
    expect(s.risk.closeFactorAtLiquidation.toString()).toBe('1');
  });

  it('drops the small-position flag once collateral and debt both clear $2,000', () => {
    const r = simulateLoop(
      input({
        seedUsd: d(5000),
        policy: { kind: 'fixed', loops: 2 },
        stopping: {
          ...correlatedStoppingRule(),
          minHealthFactor: d('1.05'),
          postActionHfBuffer: d(0),
          smallPositionHfBuffer: d(0),
          maxLeverage: d(10),
          minPriceDropToLiquidation: d(0),
          maxLiquidationProbability: d(1),
        },
      }),
    );
    const s = r.steps[2]!;
    expect(s.collateralUsd.gte(2000)).toBe(true);
    expect(s.debtUsd.gte(2000)).toBe(true);
    expect(s.risk.smallPosition).toBe(false);
    expect(s.risk.closeFactorAtLiquidation.toString()).toBe('0.5');
  });
});
