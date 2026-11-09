import { DAYS_PER_YEAR, ZERO, d, type Decimal } from '@shadow-banking/core';
import { type AccountId } from './chart.js';
import type { Ledger } from './ledger.js';

export interface IncomeBreakdown {
  staking: Decimal;
  lending: Decimal;
  funding: Decimal;
  lp: Decimal;
  incentives: Decimal;
  realizedPnl: Decimal;
}

export interface ExpenseBreakdown {
  fees: Decimal;
  financingCost: Decimal;
  fundingExpense: Decimal;
  liquidationLoss: Decimal;
  otherLoss: Decimal;
  operatingExpense: Decimal;
}

export interface LiquidationExposure {
  worstHealthFactor: Decimal | null;
  worstLiquidationDistance: Decimal | null;
  totalCollateral: Decimal;
  totalDebt: Decimal;
}

export interface PerformanceReport {
  asOf: string;
  currency: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  nav: Decimal;
  grossAssets: Decimal;
  totalDebt: Decimal;
  equity: Decimal;
  netContributedCapital: Decimal;
  initialEquity: Decimal;
  deposits: Decimal;
  withdrawals: Decimal;
  netPnl: Decimal;
  realizedPnl: Decimal;
  unrealizedPnl: Decimal;
  realizedReturn: Decimal | null;
  roie: Decimal | null;
  roae: Decimal | null;
  returnOnDeployedCapital: Decimal | null;
  periodReturn: Decimal | null;
  /** Always an estimate unless the observation window is a full year; still labeled. */
  netAnnualizedYield: Decimal | null;
  netAnnualizedYieldKind: 'estimate';
  annualizationAssumptions: string;
  grossAssetsToEquity: Decimal | null;
  financingCosts: Decimal;
  income: IncomeBreakdown;
  expenses: ExpenseBreakdown;
  liquidReserves: Decimal;
  deployedCapital: Decimal;
  maxDrawdown: Decimal;
  highWaterUnitNav: Decimal;
  liquidationExposure: LiquidationExposure;
  hurdleApy: Decimal;
  /** Comparison of the annualized *estimate* to the evaluation hurdle — not a promise. */
  clearsHurdleOnAnnualizedEstimate: boolean | null;
  figuresNote: string;
}

function ratio(num: Decimal, den: Decimal): Decimal | null {
  if (!den.isFinite() || den.lte(0)) return null;
  return num.div(den);
}

function timeWeightedAverage(values: { at: string; value: Decimal }[]): Decimal | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0]!.value;
  let acc = ZERO;
  let days = ZERO;
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    const cur = values[i]!;
    const dt = d(Math.max(0, (Date.parse(cur.at) - Date.parse(prev.at)) / 86_400_000));
    acc = acc.plus(prev.value.mul(dt));
    days = days.plus(dt);
  }
  if (days.lte(0)) return values[values.length - 1]!.value;
  return acc.div(days);
}

export function maxDrawdownFromUnitNav(unitNavs: readonly Decimal[]): {
  maxDrawdown: Decimal;
  highWater: Decimal;
} {
  let high = ZERO;
  let maxDd = ZERO;
  for (const u of unitNavs) {
    if (u.gt(high)) high = u;
    if (high.gt(0)) {
      const dd = u.div(high).minus(1);
      if (dd.lt(maxDd)) maxDd = dd;
    }
  }
  return { maxDrawdown: maxDd, highWater: high };
}

export function buildPerformanceReport(ledger: Ledger, hurdleApy?: Decimal): PerformanceReport {
  const entries = ledger.getEntries();
  const snaps = ledger.getSnapshots();
  const first = entries[0];
  const last = entries[entries.length - 1];
  const hurdle = hurdleApy ?? ledger.meta.defaultHurdleApy;
  const periodDays = ledger.periodDays();
  const initial = ledger.initialEquity();
  const nav = ledger.nav();
  const unitStart = snaps[0]?.unitNav ?? d(1);
  const unitEnd = ledger.unitNav();
  const periodReturn = unitStart.gt(0) ? unitEnd.div(unitStart).minus(1) : null;
  let netAnnualizedYield: Decimal | null = null;
  if (periodReturn !== null && periodDays > 0) {
    const t = d(periodDays).div(DAYS_PER_YEAR);
    netAnnualizedYield = d(1).plus(periodReturn).pow(d(1).div(t)).minus(1);
  }
  const avgEquity = timeWeightedAverage(snaps.map((s) => ({ at: s.at, value: s.nav })));
  const avgDeployed = timeWeightedAverage(snaps.map((s) => ({ at: s.at, value: s.deployed })));
  const dd = maxDrawdownFromUnitNav(snaps.map((s) => s.unitNav));
  const health = ledger.positionHealth();
  const hfs = health.map((p) => p.healthFactor).filter((x): x is Decimal => x !== null);
  const dists = health.map((p) => p.liquidationDistance).filter((x): x is Decimal => x !== null);
  const worstHf = hfs.length ? hfs.reduce((a, b) => (a.lte(b) ? a : b)) : null;
  const worstDist = dists.length ? dists.reduce((a, b) => (a.lte(b) ? a : b)) : null;

  const annualizationAssumptions =
    `Annualized from unit-NAV (flow-adjusted) over ${periodDays.toFixed(2)} calendar days using a ${DAYS_PER_YEAR.toString()}-day year: ` +
    `(1 + periodReturn)^(365/days) − 1. This is an estimate, not a realized full-year return and not a promised yield. ` +
    `The ${hurdle.mul(100).toFixed(0)}% hurdle is an evaluation bar only. Borrowed principal and inter-account transfers are excluded from P&L.`;

  return {
    asOf: last?.at ?? ledger.meta.createdAt,
    currency: ledger.meta.currency,
    label: ledger.meta.label,
    periodStart: first?.at ?? ledger.meta.createdAt,
    periodEnd: last?.at ?? ledger.meta.createdAt,
    periodDays,
    nav,
    grossAssets: ledger.grossAssets(),
    totalDebt: ledger.totalDebt(),
    equity: nav,
    netContributedCapital: ledger.netContributed(),
    initialEquity: initial,
    deposits: ledger.depositsAfterSeed(),
    withdrawals: ledger.withdrawals(),
    netPnl: ledger.netPnl(),
    realizedPnl: ledger.realizedPnl(),
    unrealizedPnl: ledger.unrealizedPnl(),
    realizedReturn: ratio(ledger.realizedPnl(), initial),
    roie: ratio(ledger.netPnl(), initial),
    roae: avgEquity ? ratio(ledger.netPnl(), avgEquity) : null,
    returnOnDeployedCapital: avgDeployed ? ratio(ledger.netPnl(), avgDeployed) : null,
    periodReturn,
    netAnnualizedYield,
    netAnnualizedYieldKind: 'estimate',
    annualizationAssumptions,
    grossAssetsToEquity: ratio(ledger.grossAssets(), nav),
    financingCosts: ledger.financingCosts(),
    income: {
      staking: ledger.balance('staking_income' satisfies AccountId),
      lending: ledger.balance('lending_income'),
      funding: ledger.balance('funding_income'),
      lp: ledger.balance('lp_income'),
      incentives: ledger.balance('incentives'),
      realizedPnl: ledger.balance('realized_pnl'),
    },
    expenses: {
      fees: ledger.balance('fees'),
      financingCost: ledger.balance('financing_cost'),
      fundingExpense: ledger.balance('funding_expense'),
      liquidationLoss: ledger.balance('liquidation_loss'),
      otherLoss: ledger.balance('other_loss'),
      operatingExpense: ledger.balance('operating_expense'),
    },
    liquidReserves: ledger.liquidReserves(),
    deployedCapital: ledger.deployedCapital(),
    maxDrawdown: dd.maxDrawdown,
    highWaterUnitNav: dd.highWater,
    liquidationExposure: {
      worstHealthFactor: worstHf,
      worstLiquidationDistance: worstDist,
      totalCollateral: ledger.balance('collateral_assets'),
      totalDebt: ledger.totalDebt(),
    },
    hurdleApy: hurdle,
    clearsHurdleOnAnnualizedEstimate:
      netAnnualizedYield === null ? null : netAnnualizedYield.gte(hurdle),
    figuresNote:
      'Consolidated performance of the managed balance sheet. Protocol APYs are not reported as the product output. ' +
      'Realized P&L is income and expenses actually booked; unrealized P&L is mark-to-market. ' +
      'Annualized yield is an estimate. Deposits, withdrawals, borrowed principal, and internal transfers are not profit.',
  };
}
