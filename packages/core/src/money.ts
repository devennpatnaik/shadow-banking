import { Decimal } from 'decimal.js';

// All monetary and rate arithmetic in this repo goes through Decimal. Floating point is
// reserved for probability estimates (see simulator/src/probability.ts), never for balances.
Decimal.set({
  precision: 34,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -18,
  toExpPos: 30,
});

export { Decimal };

/** Anything Decimal can be constructed from: number, numeric string, or Decimal. */
export type Numeric = Decimal.Value;

export const d = (value: Numeric): Decimal => new Decimal(value);

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);
export const HUNDRED = new Decimal(100);
export const DAYS_PER_YEAR = new Decimal(365);
export const MONTHS_PER_YEAR = new Decimal(12);

export function sum(values: Iterable<Numeric>): Decimal {
  let total = ZERO;
  for (const v of values) total = total.plus(v);
  return total;
}

export function max0(value: Decimal): Decimal {
  return value.isNegative() ? ZERO : value;
}

export function min(a: Decimal, b: Decimal): Decimal {
  return a.lte(b) ? a : b;
}

export function max(a: Decimal, b: Decimal): Decimal {
  return a.gte(b) ? a : b;
}

export function assertNonNegative(value: Decimal, name: string): void {
  if (value.isNegative() || value.isNaN()) {
    throw new RangeError(`${name} must be a non-negative finite number, got ${value.toString()}`);
  }
}

export function assertFraction(value: Decimal, name: string): void {
  if (value.isNaN() || value.lt(0) || value.gt(1)) {
    throw new RangeError(`${name} must be between 0 and 1 inclusive, got ${value.toString()}`);
  }
}

/** Convert a yearly rate to the amount accrued over `days` with the given compounding. */
export function accrualFactor(
  annualRate: Decimal,
  days: Numeric,
  compounding: 'simple' | 'daily' | 'continuous' = 'simple',
): Decimal {
  const t = d(days).div(DAYS_PER_YEAR);
  switch (compounding) {
    case 'simple':
      return annualRate.mul(t);
    case 'daily':
      return ONE.plus(annualRate.div(DAYS_PER_YEAR)).pow(d(days)).minus(ONE);
    case 'continuous':
      return annualRate.mul(t).exp().minus(ONE);
  }
}

/** "12.34%" formatting for reports. */
export function formatPct(value: Decimal | null, dp = 2): string {
  if (value === null) return 'n/a';
  if (!value.isFinite()) return '∞';
  return `${value.mul(HUNDRED).toFixed(dp)}%`;
}

/** Fixed-point money formatting with thousands separators. */
export function formatMoney(value: Decimal | null, dp = 2, symbol = '$'): string {
  if (value === null) return 'n/a';
  const fixed = value.toFixed(dp);
  const [whole, frac] = fixed.replace('-', '').split('.');
  const grouped = (whole ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = value.isNegative() ? '-' : '';
  return `${sign}${symbol}${grouped}${frac !== undefined ? `.${frac}` : ''}`;
}

export function formatRatio(value: Decimal | null, dp = 2): string {
  if (value === null) return 'n/a';
  if (!value.isFinite()) return '∞';
  return `${value.toFixed(dp)}x`;
}

/** JSON-safe representation: strings preserve precision and avoid float round-trips. */
export function toJsonNumber(value: Decimal | null): string | null {
  if (value === null) return null;
  if (!value.isFinite()) return value.isNegative() ? '-Infinity' : 'Infinity';
  return value.toString();
}
