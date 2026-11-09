import type { Decimal, DisclosureProfile } from '@shadow-banking/core';
import type { MarketSnapshotFile } from '@shadow-banking/simulator';

/** Candidate strategies from spec §4–5. `preserve-liquid` is the no-deployment state. */
export type StrategyId =
  'preserve-liquid' | 'hold-lst' | 'loop-2x' | 'loop-3x' | 'hedged-carry' | 'lp';

export type FundingBasis = 'avg30d' | 'planning' | 'current' | 'stress';

export interface HyperliquidParams {
  takerFeeRate: Decimal;
  makerFeeRate: Decimal;
  minOrderNotionalUsd: Decimal;
  minDepositUsdc: Decimal;
  withdrawalFeeUsdc: Decimal;
  ethMaxLeverage: Decimal;
  ethMaintenanceMarginRate: Decimal;
  /** Isolated-margin venue leverage cap from the risk governor (starting 2×). */
  governorMaxVenueLeverage: Decimal;
  fundingApr: Decimal;
  fundingCurrentApr: Decimal;
  fundingPlanningApr: Decimal;
  fundingStressApr: Decimal;
}

export interface ResolvedMarket {
  snapshot: MarketSnapshotFile;
  snapshotDate: string;
  hurdleApy: Decimal;
  lstSymbol: string;
  lstYieldApy: Decimal;
  lstPriceUsd: Decimal;
  borrowSymbol: string;
  borrowApy: Decimal;
  network: string;
  protocol: string;
  ltv: Decimal;
  liquidationThreshold: Decimal;
  liquidationBonus: Decimal;
  eMode: boolean;
  eModeCategory?: string;
  /** Highest USDC supply APY in the snapshot (preserve-liquid venue). */
  usdcSupplyApy: Decimal;
  usdcNetwork: string;
  usdcProtocol: string;
  swapFeeWstEth: Decimal;
  swapImpactWstEth: Decimal;
  swapFeeUsdcEth: Decimal;
  swapImpactUsdcEth: Decimal;
  hyperliquid: HyperliquidParams;
  /** Estimated LP fee APR on a wstETH/ETH position (not in every snapshot). */
  lpFeeApr: Decimal;
  /** Loss-versus-rebalancing drag, decimal per year of LP equity. */
  lpLvrApr: Decimal;
}

export interface CapitalPlan {
  seedUsd: Decimal;
  deployableUsd: Decimal;
  reserveUsd: Decimal;
  reserveRate: Decimal;
  investableUsd: Decimal;
  householdRequirementUsd: Decimal;
  shortfallUsd: Decimal;
  notes: string[];
  leverageAllowed: boolean;
  derivativesAllowed: boolean;
  lpAllowed: boolean;
}

export interface YieldStack {
  /** Recurring income before any deduction (staking, supply, LP fees, funding received). */
  grossIncomeUsd: Decimal;
  grossApy: Decimal;
  financingUsd: Decimal;
  executionUsd: Decimal;
  expectedLossUsd: Decimal;
  /** gross − financing − execution − expected losses (spec §5). */
  estimatedNetUsd: Decimal;
  estimatedNetApy: Decimal;
  /**
   * Realized figures require the accounting ledger (a different deliverable).
   * `capable` is false until a ledger is wired; never invent a realized yield.
   */
  realized: {
    capable: boolean;
    incomeUsd: Decimal | null;
    apy: Decimal | null;
    reason: string;
  };
}

export interface RiskMeasures {
  healthFactor: Decimal | null;
  liquidationDistance: Decimal | null;
  hedgeLiquidationDistance: Decimal | null;
  leverage: Decimal;
  ltv: Decimal | null;
  directionalExposure: Decimal;
  concentration: {
    byAsset: string;
    byProtocol: string;
    byNetwork: string;
    assetShare: Decimal;
    protocolShare: Decimal;
  };
  smallPosition: boolean;
  fullyLiquidatableInOneCall: boolean;
  expectedLiquidationLossUsd: Decimal;
  breaches: string[];
  withinGovernorLimits: boolean;
}

export interface StrategyEvaluation {
  id: StrategyId;
  label: string;
  eligible: boolean;
  ineligibleReason?: string;
  equityUsd: Decimal;
  deployedUsd: Decimal;
  debtUsd: Decimal;
  reserveUsd: Decimal;
  yield: YieldStack;
  /** Portfolio view: strategy sleeve + reserve earning the preserve-liquid rate. */
  portfolioEstimatedNetUsd: Decimal;
  portfolioEstimatedNetApy: Decimal;
  risk: RiskMeasures;
  /**
   * Estimated net APY on deployable capital, scaled down by leverage, directional
   * exposure, and inverse liquidation distance. Higher is better.
   */
  riskAdjustedApy: Decimal;
  clearsHurdle: boolean;
  portfolioClearsHurdle: boolean;
  oneOffCostsUsd: Decimal;
  assumptions: string[];
}

export interface ComparisonInput {
  market: ResolvedMarket;
  capital: CapitalPlan;
  hurdleApy: Decimal;
  horizonDays: number;
  includeUnwindCosts: boolean;
  /** Isolated-margin long share of equity for hedged carry (default 0.60). */
  hedgedLongShare: Decimal;
  disclosure?: DisclosureProfile;
}

export type RecommendationAction = 'preserve-capital' | 'deploy';

export interface ComparisonResult {
  snapshotDate: string;
  hurdleApy: Decimal;
  horizonDays: number;
  capital: CapitalPlan;
  evaluations: StrategyEvaluation[];
  recommendation: {
    action: RecommendationAction;
    strategyId: StrategyId;
    clearsHurdle: boolean;
    reasons: string[];
  };
  warnings: string[];
}
