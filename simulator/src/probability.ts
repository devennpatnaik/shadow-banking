/**
 * Probability helpers. These are *estimates* of liquidation risk, so plain floating point is
 * acceptable here; nothing in this file touches a balance.
 */

/** Abramowitz & Stegun 7.1.26 erf approximation (|error| < 1.5e-7). */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF. */
export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/**
 * Probability that a driftless lognormal price (annualized volatility `sigma`) touches a level
 * `(1 - drop)` times its starting value at any time within `years`.
 *
 * With X_t = ln(S_t/S_0) = μt + σW_t and μ = −σ²/2, the first-passage probability to barrier
 * a = ln(1 − drop) < 0 is Φ((a − μT)/(σ√T)) + e^{2μa/σ²} Φ((a + μT)/(σ√T)).
 */
export function liquidationTouchProbability(drop: number, sigma: number, years: number): number {
  if (!(drop > 0)) return 1;
  if (drop >= 1) return 0;
  if (!(sigma > 0) || !(years > 0)) return 0;
  const a = Math.log(1 - drop);
  const mu = -(sigma * sigma) / 2;
  const sT = sigma * Math.sqrt(years);
  const p =
    normalCdf((a - mu * years) / sT) +
    Math.exp((2 * mu * a) / (sigma * sigma)) * normalCdf((a + mu * years) / sT);
  return Math.min(1, Math.max(0, p));
}
