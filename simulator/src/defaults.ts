import { d } from '@shadow-banking/core';
import type { MarketInput, StoppingRule } from './types.js';

/** Aave v3.3 close-factor defaults. */
export const AAVE_V3_CLOSE_FACTOR = d('0.5');
export const AAVE_V3_FULL_LIQUIDATION_HF = d('0.95');
/** Positions with collateral or debt below this are 100% liquidatable in one call. */
export const AAVE_V3_SMALL_POSITION_USD = d(2000);

export function aaveMarket(partial: {
  protocol: string;
  network: string;
  ltv: string | number;
  liquidationThreshold: string | number;
  liquidationBonus: string | number;
  eMode: boolean;
  eModeCategory?: string;
}): MarketInput {
  return {
    protocol: partial.protocol,
    network: partial.network,
    ltv: d(partial.ltv),
    liquidationThreshold: d(partial.liquidationThreshold),
    liquidationBonus: d(partial.liquidationBonus),
    eMode: partial.eMode,
    ...(partial.eModeCategory !== undefined ? { eModeCategory: partial.eModeCategory } : {}),
    closeFactor: AAVE_V3_CLOSE_FACTOR,
    fullLiquidationHfThreshold: AAVE_V3_FULL_LIQUIDATION_HF,
    smallPositionUsd: AAVE_V3_SMALL_POSITION_USD,
  };
}

/**
 * Default stopping rule for correlated (E-mode) loops. Hurdle is 10% annualized net —
 * configurable, not a promised return (spec §5).
 */
export function correlatedStoppingRule(hurdleApy = d('0.10')): StoppingRule {
  return {
    hurdleApy,
    minHealthFactor: d('1.25'),
    postActionHfBuffer: d('0.05'),
    smallPositionHfBuffer: d('0.10'),
    minPriceDropToLiquidation: d('0.08'),
    maxLiquidationProbability: d('0.20'),
    maxLeverage: d('3'),
    maxLoops: 8,
    marginalNetIncomeFloorUsd: d('0'),
    minBorrowUsd: d('5'),
  };
}

export function uncorrelatedStoppingRule(hurdleApy = d('0.10')): StoppingRule {
  return {
    hurdleApy,
    minHealthFactor: d('1.60'),
    postActionHfBuffer: d('0.15'),
    smallPositionHfBuffer: d('0.10'),
    minPriceDropToLiquidation: d('0.25'),
    maxLiquidationProbability: d('0.10'),
    maxLeverage: d('2'),
    maxLoops: 4,
    marginalNetIncomeFloorUsd: d('0'),
    minBorrowUsd: d('5'),
  };
}
