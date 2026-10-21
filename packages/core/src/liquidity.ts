import { d, max0, sum, ZERO, ONE, assertFraction, type Decimal } from './money.js';
import type { DisclosureProfile, IncomeStability, RiskTolerance } from './disclosure.js';

/**
 * Liquidity reserve and deployable capital (spec §2B, §6).
 *
 * Two different reserves exist and are kept apart on purpose:
 *  1. The household liquidity requirement: expenses cover + near-term cash needs + buffer.
 *     Money that must stay outside the strategy. Derived from disclosures.
 *  2. The strategy contingency reserve: a share (10–30% starting assumption) of the capital
 *     that is deployable, kept liquid inside the managed balance sheet to service debt, meet
 *     margin, or de-risk without selling into stress.
 */

export interface ReservePolicy {
  /** Months of outflow to hold back, by income stability. */
  expenseCoverMonths: Record<IncomeStability, number>;
  /** Near-term cash needs due within this many months are reserved in full. */
  nearTermWindowMonths: number;
  /** Buffer applied on top of (expense cover + near-term needs). */
  bufferRate: Decimal;
  /** Minimum-payment debt service is part of the monthly outflow. */
  includeDebtService: boolean;
  /** Strategy reserve as a share of deployable capital, by risk tolerance. */
  strategyReserveByRiskTolerance: Record<RiskTolerance, Decimal>;
  /** Explicit override of the strategy reserve rate. */
  strategyReserveRate?: Decimal;
}

export const DEFAULT_RESERVE_POLICY: ReservePolicy = {
  expenseCoverMonths: { stable: 3, variable: 6, irregular: 9, none: 12 },
  nearTermWindowMonths: 12,
  bufferRate: d('0.10'),
  includeDebtService: true,
  strategyReserveByRiskTolerance: {
    conservative: d('0.30'),
    moderate: d('0.20'),
    aggressive: d('0.10'),
  },
};

export interface HouseholdLiquidityRequirement {
  monthlyExpenses: Decimal;
  monthlyDebtService: Decimal;
  monthlyOutflow: Decimal;
  coverMonths: number;
  expenseCover: Decimal;
  nearTermNeeds: Decimal;
  nearTermItems: { label: string; amount: Decimal; dueInMonths: number }[];
  buffer: Decimal;
  total: Decimal;
}

export function householdLiquidityRequirement(
  profile: DisclosureProfile,
  policy: ReservePolicy = DEFAULT_RESERVE_POLICY,
): HouseholdLiquidityRequirement {
  const monthlyExpenses = sum(profile.recurringExpenses.map((e) => e.monthlyAmount));
  const monthlyDebtService = policy.includeDebtService
    ? sum(profile.existingDebts.map((x) => x.minimumMonthlyPayment))
    : ZERO;
  const monthlyOutflow = monthlyExpenses.plus(monthlyDebtService);
  const coverMonths = policy.expenseCoverMonths[profile.income.stability];
  const expenseCover = monthlyOutflow.mul(coverMonths);
  const nearTermItems = profile.nearTermCashNeeds.filter(
    (n) => n.dueInMonths <= policy.nearTermWindowMonths,
  );
  const nearTermNeeds = sum(nearTermItems.map((n) => n.amount));
  const buffer = expenseCover.plus(nearTermNeeds).mul(policy.bufferRate);
  return {
    monthlyExpenses,
    monthlyDebtService,
    monthlyOutflow,
    coverMonths,
    expenseCover,
    nearTermNeeds,
    nearTermItems,
    buffer,
    total: expenseCover.plus(nearTermNeeds).plus(buffer),
  };
}

export interface DeployableCapital {
  /** T0 + T1 owner-controlled assets offered for deployment (never the whole balance). */
  liquidOwnerCapital: Decimal;
  requirement: HouseholdLiquidityRequirement;
  /** Emergency savings already set aside are credited against the requirement. */
  emergencySavingsCredit: Decimal;
  /** Requirement left to fund out of liquid capital after the credit. */
  uncoveredRequirement: Decimal;
  /** How far liquid capital falls short of the household requirement (0 when covered). */
  shortfall: Decimal;
  deployable: Decimal;
  notes: string[];
}

export interface DeployableOptions {
  /** Hurdle used to flag existing debt that should be repaid before anything is deployed. */
  hurdleApy?: Decimal;
  /** If emergency savings are already part of liquidOwnerCapital, pass true to avoid double counting. */
  emergencySavingsIncludedInLiquid?: boolean;
}

/**
 * Deployable capital = liquid owner capital − uncovered household requirement, floored at 0.
 * Emergency savings are credited against the requirement because they are, by disclosure,
 * already held for that purpose.
 */
export function deployableCapital(
  profile: DisclosureProfile,
  liquidOwnerCapital: Decimal,
  policy: ReservePolicy = DEFAULT_RESERVE_POLICY,
  opts: DeployableOptions = {},
): DeployableCapital {
  const requirement = householdLiquidityRequirement(profile, policy);
  const notes: string[] = [];
  const emergencySavingsCredit = opts.emergencySavingsIncludedInLiquid
    ? ZERO
    : profile.emergencySavings.lte(requirement.total)
      ? profile.emergencySavings
      : requirement.total;
  const uncoveredRequirement = max0(requirement.total.minus(emergencySavingsCredit));
  const deployable = max0(liquidOwnerCapital.minus(uncoveredRequirement));
  const shortfall = max0(uncoveredRequirement.minus(liquidOwnerCapital));

  if (shortfall.gt(0)) {
    notes.push(
      `Liquid capital is short of the household liquidity requirement by ${shortfall.toFixed(2)}; nothing is deployable.`,
    );
  }
  if (!profile.restrictions.allowLeverage) {
    notes.push(
      'Disclosures prohibit leverage: deployable capital may only be held in unlevered form.',
    );
  }
  if (opts.hurdleApy) {
    for (const debt of profile.existingDebts) {
      if (debt.balance.gt(0) && debt.annualRate.gte(opts.hurdleApy)) {
        notes.push(
          `Existing debt "${debt.label}" costs ${debt.annualRate.mul(100).toFixed(2)}%/yr, at or above the ${opts.hurdleApy.mul(100).toFixed(2)}% hurdle; repaying it is a risk-free return that dominates deployment.`,
        );
      }
    }
  }
  if (profile.income.stability === 'none' || profile.income.stability === 'irregular') {
    notes.push(
      `Income stability is "${profile.income.stability}": ${requirement.coverMonths} months of outflow held back.`,
    );
  }
  return {
    liquidOwnerCapital,
    requirement,
    emergencySavingsCredit,
    uncoveredRequirement,
    shortfall,
    deployable,
    notes,
  };
}

export interface StrategyReserve {
  rate: Decimal;
  amount: Decimal;
  /** Deployable capital left after the reserve: the maximum that may enter productive positions. */
  investable: Decimal;
  notes: string[];
}

/** Strategy contingency reserve inside deployable capital (10–30% starting assumption). */
export function strategyReserve(
  deployable: Decimal,
  profile: DisclosureProfile,
  policy: ReservePolicy = DEFAULT_RESERVE_POLICY,
): StrategyReserve {
  const rate =
    policy.strategyReserveRate ?? policy.strategyReserveByRiskTolerance[profile.riskTolerance];
  assertFraction(rate, 'strategy reserve rate');
  const notes: string[] = [];
  if (rate.lt('0.10') || rate.gt('0.30')) {
    notes.push(
      `Strategy reserve rate ${rate.mul(100).toFixed(1)}% is outside the 10–30% starting range; make sure this is deliberate.`,
    );
  }
  const amount = deployable.mul(rate);
  return { rate, amount, investable: deployable.minus(amount), notes };
}

/** Required reserve for the consolidated report: household requirement + strategy reserve. */
export function requiredLiquidityReserve(
  profile: DisclosureProfile,
  deployable: Decimal,
  policy: ReservePolicy = DEFAULT_RESERVE_POLICY,
): { household: Decimal; strategy: Decimal; total: Decimal } {
  const household = householdLiquidityRequirement(profile, policy).total;
  const strategy = strategyReserve(deployable, profile, policy).amount;
  return { household, strategy, total: household.plus(strategy) };
}

export const FULL = ONE;
