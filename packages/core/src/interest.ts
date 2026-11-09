import { accrualFactor, type Numeric } from './money.js';
import type { Liability } from './model.js';

export type Compounding = 'simple' | 'daily' | 'continuous';

/**
 * Accrue interest on a liability over `days`. Aave-style variable debt compounds per second,
 * which `continuous` approximates; `simple` is the conservative-for-income / optimistic-for-cost
 * choice and the default for short periods.
 */
export function accrueInterest(
  liability: Liability,
  days: Numeric,
  compounding: Compounding = 'simple',
): Liability {
  const base = liability.principal.plus(liability.accruedInterest);
  const interest = base.mul(accrualFactor(liability.currentApr, days, compounding));
  return { ...liability, accruedInterest: liability.accruedInterest.plus(interest) };
}

/** Annual interest expense at the current rate, in reporting currency (an estimate). */
export function annualInterestExpense(liability: Liability) {
  return liability.principal
    .plus(liability.accruedInterest)
    .mul(liability.priceMark)
    .mul(liability.currentApr);
}
