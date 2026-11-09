import { describe, it, expect } from 'vitest';
import {
  d,
  parseDisclosureProfile,
  householdLiquidityRequirement,
  deployableCapital,
  strategyReserve,
  requiredLiquidityReserve,
  DEFAULT_RESERVE_POLICY,
} from '../src/index.js';
import { expectDec, fixtureDisclosure } from './fixtures.js';

describe('disclosure schema', () => {
  it('parses numbers and numeric strings into Decimals with defaults applied', () => {
    const p = parseDisclosureProfile(fixtureDisclosure());
    expectDec(p.income.monthlyNet, '4000');
    expectDec(p.recurringExpenses[1]!.monthlyAmount, '500');
    expectDec(p.existingDebts[1]!.annualRate, '0.05');
    expect(p.currency).toBe('USD');
    expect(p.restrictions.allowLeverage).toBe(true);
    expect(p.restrictions.excludedAssetClasses).toEqual([]);
  });

  it('rejects negative money and implausible rates', () => {
    const bad = fixtureDisclosure();
    bad.emergencySavings = -1;
    expect(() => parseDisclosureProfile(bad)).toThrow();
    const badRate = fixtureDisclosure();
    badRate.existingDebts[0]!.annualRate = 24; // 2400%: almost certainly meant 0.24
    expect(() => parseDisclosureProfile(badRate)).toThrow();
  });
});

describe('household liquidity requirement', () => {
  it('= outflow × cover months + near-term needs within window + 10% buffer', () => {
    const p = parseDisclosureProfile(fixtureDisclosure());
    const r = householdLiquidityRequirement(p);
    expectDec(r.monthlyExpenses, '2000');
    expectDec(r.monthlyDebtService, '150');
    expectDec(r.monthlyOutflow, '2150');
    expect(r.coverMonths).toBe(3); // stable income
    expectDec(r.expenseCover, '6450'); // 2,150 × 3
    expectDec(r.nearTermNeeds, '1200'); // the 18-month trip is outside the 12-month window
    expect(r.nearTermItems.map((n) => n.label)).toEqual(['tax bill']);
    expectDec(r.buffer, '765'); // 10% × 7,650
    expectDec(r.total, '8415');
  });

  it('holds back more months when income is unstable', () => {
    const p = parseDisclosureProfile({
      ...fixtureDisclosure(),
      income: { monthlyNet: 4000, stability: 'variable' },
    });
    const r = householdLiquidityRequirement(p);
    expect(r.coverMonths).toBe(6);
    expectDec(r.total, '15510'); // (2,150 × 6 + 1,200) × 1.1
  });

  it('can exclude debt service by policy', () => {
    const p = parseDisclosureProfile(fixtureDisclosure());
    const r = householdLiquidityRequirement(p, {
      ...DEFAULT_RESERVE_POLICY,
      includeDebtService: false,
    });
    expectDec(r.expenseCover, '6000');
    expectDec(r.total, '7920'); // (6,000 + 1,200) × 1.1
  });
});

describe('deployable capital', () => {
  it('frees up only what disclosures allow, not the whole balance', () => {
    const p = parseDisclosureProfile(fixtureDisclosure());
    // Liquid owner capital 6,300 (T0 5,300 + T1 1,000 from the fixture balance sheet).
    const dc = deployableCapital(p, d(6300), DEFAULT_RESERVE_POLICY, { hurdleApy: d('0.10') });
    expectDec(dc.emergencySavingsCredit, '3000');
    expectDec(dc.uncoveredRequirement, '5415'); // 8,415 − 3,000
    expectDec(dc.deployable, '885'); // 6,300 − 5,415
    expectDec(dc.shortfall, '0');
    expect(dc.notes.some((n) => n.includes('credit card') && n.includes('24.00%'))).toBe(true);
    expect(dc.notes.some((n) => n.includes('student loan'))).toBe(false);
  });

  it('is zero with a shortfall when the requirement is not covered', () => {
    const p = parseDisclosureProfile({
      ...fixtureDisclosure(),
      income: { monthlyNet: 4000, stability: 'variable' },
    });
    const dc = deployableCapital(p, d(6300));
    expectDec(dc.uncoveredRequirement, '12510'); // 15,510 − 3,000
    expectDec(dc.deployable, '0');
    expectDec(dc.shortfall, '6210');
    expect(dc.notes[0]).toMatch(/nothing is deployable/);
  });

  it('does not double-count emergency savings already in the liquid figure', () => {
    const p = parseDisclosureProfile(fixtureDisclosure());
    const dc = deployableCapital(p, d(9300), DEFAULT_RESERVE_POLICY, {
      emergencySavingsIncludedInLiquid: true,
    });
    expectDec(dc.emergencySavingsCredit, '0');
    expectDec(dc.deployable, '885'); // 9,300 − 8,415
  });

  it('caps the emergency-savings credit at the requirement', () => {
    const p = parseDisclosureProfile({ ...fixtureDisclosure(), emergencySavings: 20000 });
    const dc = deployableCapital(p, d(1000));
    expectDec(dc.emergencySavingsCredit, '8415');
    expectDec(dc.deployable, '1000');
  });

  it('notes when leverage is prohibited', () => {
    const p = parseDisclosureProfile({
      ...fixtureDisclosure(),
      restrictions: { allowLeverage: false },
    });
    const dc = deployableCapital(p, d(6300));
    expect(dc.notes.some((n) => /prohibit leverage/.test(n))).toBe(true);
  });
});

describe('strategy reserve and required reserve', () => {
  it('defaults to 20% for moderate risk tolerance', () => {
    const p = parseDisclosureProfile(fixtureDisclosure());
    const r = strategyReserve(d(885), p);
    expectDec(r.rate, '0.2');
    expectDec(r.amount, '177');
    expectDec(r.investable, '708');
    expect(r.notes).toEqual([]);
  });

  it('uses 30% / 10% for conservative / aggressive and flags out-of-range overrides', () => {
    const cons = parseDisclosureProfile({ ...fixtureDisclosure(), riskTolerance: 'conservative' });
    expectDec(strategyReserve(d(1000), cons).amount, '300');
    const aggr = parseDisclosureProfile({ ...fixtureDisclosure(), riskTolerance: 'aggressive' });
    expectDec(strategyReserve(d(1000), aggr).amount, '100');
    const r = strategyReserve(d(1000), aggr, {
      ...DEFAULT_RESERVE_POLICY,
      strategyReserveRate: d('0.05'),
    });
    expectDec(r.amount, '50');
    expect(r.notes[0]).toMatch(/outside the 10–30%/);
    expect(() =>
      strategyReserve(d(1000), aggr, { ...DEFAULT_RESERVE_POLICY, strategyReserveRate: d('1.5') }),
    ).toThrow(RangeError);
  });

  it('total required reserve = household requirement + strategy reserve', () => {
    const p = parseDisclosureProfile(fixtureDisclosure());
    const r = requiredLiquidityReserve(p, d(885));
    expectDec(r.household, '8415');
    expectDec(r.strategy, '177');
    expectDec(r.total, '8592');
  });
});
