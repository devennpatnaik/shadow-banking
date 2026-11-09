import { describe, it, expect } from 'vitest';
import {
  d,
  accrueInterest,
  annualInterestExpense,
  accrualFactor,
  seedDepositBreakdown,
  formatMoney,
  formatPct,
  type Liability,
} from '../src/index.js';
import { expectDec } from './fixtures.js';

const loan: Liability = {
  id: 'l',
  accountId: 'a',
  symbol: 'USDC',
  principal: d(1000),
  accruedInterest: d(0),
  priceMark: d(1),
  rateType: 'variable',
  currentApr: d('0.05'),
};

describe('interest accrual', () => {
  it('simple: 1,000 × 5% × 73/365 = 10', () => {
    expectDec(accrueInterest(loan, 73).accruedInterest, '10');
  });

  it('continuous: 1,000 × (e^0.01 − 1) = 10.0501670842', () => {
    expectDec(accrueInterest(loan, 73, 'continuous').accruedInterest, '10.0501670842', 10);
  });

  it('daily compounding sits between simple and continuous', () => {
    const daily = accrueInterest(loan, 73, 'daily').accruedInterest;
    expect(daily.gt(10)).toBe(true);
    expect(daily.lt('10.0501670842')).toBe(true);
  });

  it('compounds on previously accrued interest', () => {
    const once = accrueInterest(loan, 365);
    expectDec(once.accruedInterest, '50');
    const twice = accrueInterest(once, 365);
    expectDec(twice.accruedInterest, '102.5'); // 50 + 1,050 × 5%
  });

  it('annual interest expense uses the full outstanding balance', () => {
    expectDec(annualInterestExpense({ ...loan, accruedInterest: d(50), priceMark: d(2) }), '105');
  });

  it('accrual factor for a full year at simple compounding equals the rate', () => {
    expectDec(accrualFactor(d('0.0196'), 365), '0.0196');
  });
});

describe('seed-deposit breakdown (spec §2C)', () => {
  it('explains a $1,000 seed: reserve 200, costs 5, owner deployed 795, borrowed 1,500', () => {
    const b = seedDepositBreakdown({
      seed: d(1000),
      reserve: d(200),
      entryCosts: d(5),
      ownerDeployed: d(795),
      borrowed: d(1500),
      collateralCommitted: d(2295),
    });
    expectDec(b.idleLiquid, '0');
    expectDec(b.liquid, '200');
    expectDec(b.deployed, '2295'); // 795 + 1,500
    expectDec(b.collateral, '2295');
    expectDec(b.borrowedAgainst, '1500');
    expectDec(b.ownerCapital, '995'); // seed − entry costs
    expectDec(b.borrowedCapital, '1500');
    expectDec(b.shareOfSeed.reserve, '0.2');
    expectDec(b.shareOfSeed.deployed, '2.295');
  });

  it('keeps undeployed capital as idle liquid', () => {
    const b = seedDepositBreakdown({
      seed: d(1000),
      reserve: d(200),
      entryCosts: d(0),
      ownerDeployed: d(500),
      borrowed: d(0),
      collateralCommitted: d(0),
    });
    expectDec(b.idleLiquid, '300');
    expectDec(b.liquid, '500');
  });

  it('rejects plans that spend more than the seed or borrow without collateral', () => {
    expect(() =>
      seedDepositBreakdown({
        seed: d(1000),
        reserve: d(200),
        entryCosts: d(5),
        ownerDeployed: d(800),
        borrowed: d(0),
        collateralCommitted: d(0),
      }),
    ).toThrow(/exceeds the seed/);
    expect(() =>
      seedDepositBreakdown({
        seed: d(1000),
        reserve: d(0),
        entryCosts: d(0),
        ownerDeployed: d(1000),
        borrowed: d(100),
        collateralCommitted: d(0),
      }),
    ).toThrow(/requires collateralCommitted/);
  });
});

describe('formatting', () => {
  it('formats money and percentages', () => {
    expect(formatMoney(d('1234567.891'))).toBe('$1,234,567.89');
    expect(formatMoney(d('-12.5'))).toBe('-$12.50');
    expect(formatPct(d('0.12346'))).toBe('12.35%');
    expect(formatPct(d('0.12345'))).toBe('12.34%'); // ROUND_HALF_EVEN is the configured mode
    expect(formatPct(null)).toBe('n/a');
  });
});
