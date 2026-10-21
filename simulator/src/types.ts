import type { Decimal } from '@shadow-banking/core';

/** On-chain actions the cost model prices individually. */
export type TxAction =
  'approve' | 'supply' | 'borrow' | 'repay' | 'withdraw' | 'swap' | 'setEMode' | 'bridge';

export const TX_ACTIONS: readonly TxAction[] = [
  'approve',
  'supply',
  'borrow',
  'repay',
  'withdraw',
  'swap',
  'setEMode',
  'bridge',
];

export interface CollateralAssetInput {
  symbol: string;
  priceUsd: Decimal;
  /** Intrinsic yield of the collateral (staking etc.), decimal per year. Estimate. */
  yieldApy: Decimal;
  /** Annualized volatility of the collateral price *relative to the borrow asset*. */
  volatility: Decimal;
}

export interface BorrowAssetInput {
  symbol: string;
  priceUsd: Decimal;
  /** Variable borrow rate, decimal per year. Estimate at snapshot time. */
  variableBorrowApy: Decimal;
}

export interface MarketInput {
  protocol: string;
  network: string;
  ltv: Decimal;
  liquidationThreshold: Decimal;
  liquidationBonus: Decimal;
  eMode: boolean;
  eModeCategory?: string;
  /** Default close factor (Aave v3: 50%). */
  closeFactor: Decimal;
  /** Below this HF the whole position may be liquidated in one call (Aave v3: 0.95). */
  fullLiquidationHfThreshold: Decimal;
  /**
   * Aave v3.3: when total collateral or total debt is below this USD amount the position is
   * fully liquidatable in a single call (close factor 100%). Configurable.
   */
  smallPositionUsd: Decimal;
}

export interface CostInput {
  network: string;
  /** USD cost per action after any gas basis / multiplier is applied. */
  gasUsdPerAction: Record<TxAction, Decimal>;
  /** Pool fee for collateral<->borrow asset swaps. */
  swapFeeRate: Decimal;
  /** Price impact / slippage allowance on those swaps. */
  slippageRate: Decimal;
  /** One-off bridging on entry (0 when not bridging). */
  bridgingFixedUsd: Decimal;
  bridgingRate: Decimal;
  /** Describes how the gas numbers were derived, for the report. */
  gasBasisLabel: string;
}

export type LoopPolicy =
  | { kind: 'fixed'; loops: number }
  | { kind: 'targetLtv'; targetLtv: Decimal }
  | { kind: 'optimal' };

export interface StoppingRule {
  /** Strategy-level net annualized return the position must clear to be deployed. */
  hurdleApy: Decimal;
  /** Governor "Normal" HF floor for this collateral class. */
  minHealthFactor: Decimal;
  /** New positions must land above the floor by this much. */
  postActionHfBuffer: Decimal;
  /** Extra HF buffer while the position is below the small-position threshold. */
  smallPositionHfBuffer: Decimal;
  /** Minimum relative price drop to liquidation the position must tolerate. */
  minPriceDropToLiquidation: Decimal;
  /** Maximum estimated probability of touching the liquidation level over the horizon. */
  maxLiquidationProbability: Decimal;
  /** Gross assets / equity cap. */
  maxLeverage: Decimal;
  /** Hard cap on loop iterations. */
  maxLoops: number;
  /** A loop is only taken if its marginal risk-adjusted net income exceeds this (USD / year). */
  marginalNetIncomeFloorUsd: Decimal;
  /** Loops that would borrow less than this are not worth a transaction. */
  minBorrowUsd: Decimal;
}

export interface SimulationInput {
  label: string;
  presetId?: string;
  snapshotDate: string;
  seedUsd: Decimal;
  /** Share of the seed kept liquid as the strategy reserve. */
  reserveRate: Decimal;
  /** Yield earned on the idle reserve (e.g. stablecoin supply). Estimate. */
  reserveYieldApy: Decimal;
  horizonDays: number;
  collateral: CollateralAssetInput;
  borrow: BorrowAssetInput;
  market: MarketInput;
  costs: CostInput;
  policy: LoopPolicy;
  stopping: StoppingRule;
  /** Fraction of collateral value borrowed per loop. Defaults to the market LTV. */
  stepLtv?: Decimal;
  /** Charge the projected cost of unwinding at the end of the horizon. Default true. */
  includeUnwindCosts: boolean;
  notes: string[];
}

export interface RiskAssessment {
  healthFactor: Decimal | null;
  priceDropToLiquidation: Decimal | null;
  /** Estimated probability of touching the liquidation level within the horizon. Float math. */
  liquidationProbability: Decimal | null;
  /** Position size test for the Aave v3.3 small-position rule. */
  smallPosition: boolean;
  /** Close factor that would apply at HF just below 1. */
  closeFactorAtLiquidation: Decimal;
  fullyLiquidatableInOneCall: boolean;
  /** min HF + post-action buffer (+ small-position buffer when applicable). */
  effectiveMinHealthFactor: Decimal;
  /** Expected liquidation loss over the horizon = p × close factor × debt × bonus. Estimate. */
  expectedLiquidationLossUsd: Decimal;
  breaches: string[];
}

export interface LoopStep {
  /** 0 = initial deposit, 1.. = loops executed. */
  index: number;
  borrowedThisStep: Decimal;
  collateralUsd: Decimal;
  debtUsd: Decimal;
  equityUsd: Decimal;
  leverage: Decimal;
  ltv: Decimal;
  /** Cumulative one-off entry costs paid so far (gas, swap fees, bridging). */
  entryCostsUsd: Decimal;
  /** Projected cost of fully unwinding this position. */
  unwindCostsUsd: Decimal;
  /** Annualized, estimated. */
  grossIncomeUsd: Decimal;
  interestExpenseUsd: Decimal;
  carryUsd: Decimal;
  amortizedCostsUsd: Decimal;
  expectedLiquidationLossAnnualUsd: Decimal;
  netIncomeUsd: Decimal;
  grossRoe: Decimal;
  netRoe: Decimal;
  /** Consolidated net yield on the whole seed, including the idle reserve. */
  netYieldOnSeed: Decimal;
  /** Days of positive carry needed to recover the one-off costs; null if carry <= 0. */
  costPaybackDays: Decimal | null;
  risk: RiskAssessment;
  marginal: {
    additionalProductiveAssetsUsd: Decimal;
    additionalRecurringIncomeUsd: Decimal;
    additionalInterestExpenseUsd: Decimal;
    additionalEquityExposureUsd: Decimal;
    additionalLeverage: Decimal;
    /** Change in price-drop-to-liquidation (negative = closer to liquidation). */
    additionalLiquidationRisk: Decimal | null;
    additionalLiquidationProbability: Decimal | null;
    additionalNetIncomeUsd: Decimal;
    incrementalRoe: Decimal;
  };
  /** True when this step satisfies every hard risk constraint. */
  withinLimits: boolean;
}

export type StopReason =
  | 'policy-loops-complete'
  | 'target-ltv-reached'
  | 'borrow-below-minimum'
  | 'max-loops'
  | 'marginal-economics-unattractive'
  | 'risk-limit'
  | 'no-borrow-capacity';

export interface Recommendation {
  action: 'deploy' | 'deploy-unlevered' | 'hold-liquid';
  loops: number;
  netRoe: Decimal;
  netYieldOnSeed: Decimal;
  clearsHurdle: boolean;
  hurdleApy: Decimal;
  reasons: string[];
}

export interface SimulationResult {
  input: SimulationInput;
  investedUsd: Decimal;
  reserveUsd: Decimal;
  steps: LoopStep[];
  stopReason: StopReason;
  stopDetail: string;
  recommendation: Recommendation;
  breakevens: {
    borrowApyForZeroCarry: Decimal | null;
    collateralYieldForZeroCarry: Decimal | null;
    /** Multiple of the current gas cost at which net income at the recommended step hits zero. */
    gasMultiplierForZeroNet: Decimal | null;
  };
  /** Seed-deposit breakdown at the recommended step (spec §2C). */
  seedBreakdown: {
    liquid: Decimal;
    reserve: Decimal;
    deployed: Decimal;
    collateral: Decimal;
    borrowedAgainst: Decimal;
    entryCosts: Decimal;
    ownerCapital: Decimal;
    borrowedCapital: Decimal;
  };
  warnings: string[];
}
