import { describe, it, expect } from 'vitest';
import {
  d,
  nav,
  totalAssets,
  totalLiabilities,
  capitalSplit,
  assetsByTier,
  liquidityBreakdown,
  healthFactor,
  liquidationDistance,
  borrowingCapacity,
  borrowableAtTargetHealthFactor,
  evaluateCollateralPosition,
  balanceSheetReport,
} from '../src/index.js';
import { expectDec, fixtureBalanceSheet } from './fixtures.js';

describe('valuation and NAV', () => {
  const bs = fixtureBalanceSheet();

  it('sums assets at fair value: 5,000 + 300 + 1,000 + 200 + 2,400', () => {
    expectDec(totalAssets(bs), '8900');
  });

  it('values liabilities as (principal + accrued) × price: (0.75 + 0.05) × 2,000', () => {
    expectDec(totalLiabilities(bs), '1600');
  });

  it('NAV = assets − liabilities = 7,300 (contingent obligations are not netted)', () => {
    expectDec(nav(bs), '7300');
  });

  it('splits owner vs borrowed capital and derives leverage', () => {
    const split = capitalSplit(bs);
    expectDec(split.ownerCapital, '7300');
    expectDec(split.borrowedCapital, '1600');
    expectDec(split.grossAssets, '8900');
    // 8,900 / 7,300 = 1.2191780821917808...
    expectDec(split.leverage, '1.2191780822', 10);
    // 1,600 / 8,900 = 0.1797752808988764...
    expectDec(split.borrowedShareOfAssets, '0.1797752809', 10);
  });

  it('reports leverage as null when equity is non-positive', () => {
    const insolvent = fixtureBalanceSheet();
    insolvent.liabilities[0]!.principal = d(5);
    const split = capitalSplit(insolvent);
    expectDec(split.ownerCapital, '-1200'); // 8,900 − (5.05 × 2,000 = 10,100)
    expect(split.leverage).toBeNull();
  });
});

describe('liquidity tiers (spec §6)', () => {
  const bs = fixtureBalanceSheet();

  it('classifies holdings into T0..T3 and pledged holdings as T3', () => {
    const tiers = assetsByTier(bs);
    expectDec(tiers.T0, '5300');
    expectDec(tiers.T1, '1000');
    expectDec(tiers.T2, '200');
    expectDec(tiers.T3, '2400');
  });

  it('reports borrowed funds and contingent obligations as separate categories', () => {
    const lb = liquidityBreakdown(bs);
    expectDec(lb.borrowedFunds, '1600');
    expectDec(lb.contingentObligations, '100');
  });

  it('separates observed from managed scope', () => {
    const lb = liquidityBreakdown(bs);
    expectDec(lb.byScope.observed.assets, '5000');
    expectDec(lb.byScope.observed.liabilities, '0');
    expectDec(lb.byScope.observed.byTier.T0, '5000');
    expectDec(lb.byScope.managed.assets, '3900');
    expectDec(lb.byScope.managed.liabilities, '1600');
    expectDec(lb.byScope.managed.byTier.T3, '2400');
  });

  it('rejects holdings that reference unknown accounts', () => {
    const broken = fixtureBalanceSheet();
    broken.holdings[0]!.accountId = 'ghost';
    expect(() => liquidityBreakdown(broken)).toThrow(/unknown account/);
  });
});

describe('collateral health', () => {
  const legs = [{ value: d(2400), ltv: d('0.93'), liquidationThreshold: d('0.95') }];

  it('health factor = Σ(value × LT) / debt = 2,280 / 1,600 = 1.425', () => {
    expectDec(healthFactor(legs, d(1600)), '1.425');
  });

  it('is null with no debt', () => {
    expect(healthFactor(legs, d(0))).toBeNull();
    expect(liquidationDistance(null)).toBeNull();
  });

  it('liquidation distance = 1 − 1/HF = 1 − 1,600/2,280 = 17/57', () => {
    expectDec(liquidationDistance(d('1.425')), '0.2982456140', 10);
  });

  it('liquidation distance is 0 at or below HF 1', () => {
    expectDec(liquidationDistance(d(1)), '0');
    expectDec(liquidationDistance(d('0.8')), '0');
  });

  it('borrowing capacity: max 2,400 × 0.93 = 2,232; available 632; current LTV 2/3', () => {
    const cap = borrowingCapacity(legs, d(1600));
    expectDec(cap.maxDebt, '2232');
    expectDec(cap.available, '632');
    expectDec(cap.currentLtv, '0.6666666667', 10);
  });

  it('available capacity floors at zero when over the LTV', () => {
    expectDec(borrowingCapacity(legs, d(2300)).available, '0');
  });

  it('borrowable at a target HF: 2,280/1.2 − 1,600 = 300; 2,280/1.5 − 1,600 < 0 → 0', () => {
    expectDec(borrowableAtTargetHealthFactor(legs, d(1600), d('1.2')), '300');
    expectDec(borrowableAtTargetHealthFactor(legs, d(1600), d('1.5')), '0');
  });

  it('multi-asset health factor weights each leg by its own threshold', () => {
    const mixed = [
      { value: d(1000), ltv: d('0.8'), liquidationThreshold: d('0.85') },
      { value: d(500), ltv: d('0.7'), liquidationThreshold: d('0.75') },
    ];
    // (850 + 375) / 1,000 = 1.225
    expectDec(healthFactor(mixed, d(1000)), '1.225');
    // max debt = 800 + 350 = 1,150; available = 150
    expectDec(borrowingCapacity(mixed, d(1000)).available, '150');
  });

  it('evaluates a position from the balance sheet', () => {
    const bs = fixtureBalanceSheet();
    const pos = evaluateCollateralPosition(bs, bs.collateralPositions[0]!);
    expectDec(pos.collateralValue, '2400');
    expectDec(pos.debt, '1600');
    expectDec(pos.equity, '800');
    expectDec(pos.healthFactor, '1.425');
    expect(pos.eMode).toBe(true);
  });
});

describe('consolidated report', () => {
  it('ties out equity, reserves and capacity', () => {
    const bs = fixtureBalanceSheet();
    const report = balanceSheetReport(bs, { reserveRequired: d(6000) });
    expectDec(report.equity, '7300');
    expectDec(report.borrowingCapacity, '632');
    expectDec(report.worstHealthFactor, '1.425');
    expectDec(report.reserveHeld, '5300'); // T0 only by default
    expectDec(report.reserveShortfall, '700');
  });

  it('credits a haircut share of T1 toward the reserve when asked', () => {
    const bs = fixtureBalanceSheet();
    const report = balanceSheetReport(bs, { reserveRequired: d(6000), t1ReserveCredit: d('0.5') });
    expectDec(report.reserveHeld, '5800'); // 5,300 + 50% × 1,000
    expectDec(report.reserveShortfall, '200');
  });

  it('has null health metrics when nothing is borrowed', () => {
    const bs = fixtureBalanceSheet();
    bs.liabilities = [];
    bs.collateralPositions[0]!.liabilityIds = [];
    const report = balanceSheetReport(bs);
    expect(report.worstHealthFactor).toBeNull();
    expectDec(report.equity, '8900');
    expectDec(report.borrowingCapacity, '2232');
  });
});
