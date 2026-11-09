import { d, type Decimal } from '@shadow-banking/core';
import type { KillSwitch } from './types.js';

/**
 * Starting simulation values from docs/risk-governor.md §3–§4.
 * Configurable; not a promised return. Survival over yield.
 */
export interface GovernorConfig {
  /** Annualized net evaluation hurdle (default 10%). Not a promised return. */
  hurdleApy: Decimal;
  envelopeUsd: Decimal;
  /** Default 100% of NAV. Never above 100%. */
  exposureBudget: Decimal;
  killSwitch: KillSwitch;
  /** Caution → Normal dwell. */
  cautionDwellHours: Decimal;
  /** Deleveraging → Caution dwell. */
  deleveragingDwellHours: Decimal;
  concentrationEnvelopeUsd: Decimal;
}

export const DEFAULT_HURDLE = d('0.10');
export const DEFAULT_ENVELOPE = d(1000);
export const SMALL_POSITION_USD = d(2000);
export const SMALL_POSITION_HF_BUFFER = d('0.10');

export const HF_UNCORRELATED = {
  caution: d('1.60'),
  delev: d('1.35'),
  emerg: d('1.15'),
  hysteresis: d('0.10'),
  postActionBuffer: d('0.15'),
};

export const HF_CORRELATED = {
  caution: d('1.25'),
  delev: d('1.12'),
  emerg: d('1.05'),
  hysteresis: d('0.04'),
  postActionBuffer: d('0.05'),
};

export const LD_UNCORRELATED = {
  caution: d('0.37'),
  delev: d('0.26'),
  emerg: d('0.13'),
  hysteresis: d('0.03'),
};

export const LST_DISCOUNT = {
  caution: d('0.010'),
  delev: d('0.030'),
  emerg: d('0.060'),
  hysteresis: d('0.005'),
};

export const LD_HEDGE = {
  caution: d('0.35'),
  delev: d('0.25'),
  emerg: d('0.15'),
  hysteresis: d('0.05'),
};

export const MARGIN_RATIO = {
  caution: d('0.05'),
  delev: d('0.075'),
  emerg: d('0.12'),
  hysteresis: d('0.01'),
};

export const NET_DELTA = {
  caution: d('0.05'),
  delev: d('0.10'),
  emerg: d('0.20'),
  hours: d(1),
};

export const NET_CARRY = {
  negativeHoursCaution: d(24),
  negativeHoursDelev: d(72),
  severeAnnual: d('-0.05'),
};

export const RC = {
  caution: d('1.0'),
  delev: d('0.75'),
  emerg: d('0.50'),
  exit: d('1.1'),
};

export const DAILY_PNL = {
  caution: d('-0.02'),
  delev: d('-0.04'),
  emerg: d('-0.06'),
};

export const DRAWDOWN = {
  caution: d('-0.05'),
  delev: d('-0.10'),
  emerg: d('-0.15'),
  hysteresisPts: d('0.02'),
};

export const LEVERAGE_CAP = {
  correlated: d('3.0'),
  uncorrelated: d('2.0'),
};

export const MAX_LOOP_STEPS = 3;
export const MAX_SLIPPAGE_NORMAL = d('0.005');
export const MAX_SLIPPAGE_STRESS = d('0.010');
export const MAX_EXECUTION_COST = d('0.01');
export const PROTOCOL_CONC = d('0.60');
export const NETWORK_CONC = d('0.80');
export const ASSET_CONC = d('0.70');

export function defaultConfig(overrides: Partial<GovernorConfig> = {}): GovernorConfig {
  return {
    hurdleApy: overrides.hurdleApy ?? DEFAULT_HURDLE,
    envelopeUsd: overrides.envelopeUsd ?? DEFAULT_ENVELOPE,
    exposureBudget: overrides.exposureBudget ?? d(1),
    killSwitch: overrides.killSwitch ?? 'off',
    cautionDwellHours: overrides.cautionDwellHours ?? d(6),
    deleveragingDwellHours: overrides.deleveragingDwellHours ?? d(12),
    concentrationEnvelopeUsd: overrides.concentrationEnvelopeUsd ?? d(25_000),
  };
}
