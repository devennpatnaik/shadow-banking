import type { Decimal } from '@shadow-banking/core';

export type RiskState = 'Normal' | 'Caution' | 'Deleveraging' | 'Emergency';

export const RISK_STATES: readonly RiskState[] = ['Normal', 'Caution', 'Deleveraging', 'Emergency'];

export type RecommendedAction =
  'hold_liquid' | 'operate_paper' | 'add_reserves' | 'deleverage' | 'unwind';

export type DataQuality = 'fresh' | 'stale' | 'divergent' | 'missing';

export type KillSwitch = 'off' | 'pause' | 'halt' | 'unwind';

export type Decision = 'approve' | 'approve_modified' | 'reject';

export type ActionKind =
  | 'supply'
  | 'borrow'
  | 'repay'
  | 'withdraw'
  | 'swap'
  | 'stake'
  | 'open_hedge'
  | 'close_hedge'
  | 'add_margin'
  | 'add_collateral'
  | 'bridge'
  | 'transfer_to_reserve'
  | 'compound'
  | 'unwind'
  | 'hold'
  | 'rebalance';

export interface RiskTrigger {
  metric: string;
  detail: string;
  state: RiskState;
  latched?: boolean;
}

export interface HfBands {
  caution: Decimal;
  delev: Decimal;
  emerg: Decimal;
  hysteresis: Decimal;
  postActionMin: Decimal;
}

export interface PositionRisk {
  positionId: string;
  venue: string;
  network: string | undefined;
  correlated: boolean;
  smallPosition: boolean;
  healthFactor: Decimal | null;
  liquidationDistance: Decimal | null;
  ltv: Decimal | null;
  collateralUsd: Decimal;
  debtUsd: Decimal;
}

export interface ConcentrationShares {
  protocolMaxShare: Decimal | null;
  protocolId: string | null;
  networkMaxShare: Decimal | null;
  networkId: string | null;
  nonStableAssetMaxShare: Decimal | null;
  nonStableAssetId: string | null;
}

export interface RiskObservation {
  asOf: string;
  navUsd: Decimal;
  equityUsd: Decimal;
  debtUsd: Decimal;
  grossAssetsUsd: Decimal;
  reserveHeldUsd: Decimal;
  reserveRequiredUsd: Decimal;
  healthFactor: Decimal | null;
  liquidationDistance: Decimal | null;
  ltv: Decimal | null;
  leverage: Decimal | null;
  correlated: boolean;
  smallPosition: boolean;
  drawdown: Decimal;
  dailyPnl: Decimal;
  hurdle: Decimal;
  netCarry: Decimal | null;
  netCarryHours: Decimal | null;
  lstDiscount: Decimal | null;
  ldHedge: Decimal | null;
  marginRatio: Decimal | null;
  netDelta: Decimal | null;
  netDeltaHours: Decimal | null;
  netDirectional: Decimal | null;
  borrowUtilization: Decimal | null;
  assetYield: Decimal | null;
  borrowApr: Decimal | null;
  funding7d: Decimal | null;
  stablecoinPegDeviation: Decimal | null;
  oracleDivergence: Decimal | null;
  sequencerDownHours: Decimal | null;
  withdrawalLiquidityMultiple: Decimal | null;
  reserveFrozen: boolean;
  concentration: ConcentrationShares;
  envelopeUsd: Decimal;
  dataQuality: DataQuality;
  positions: PositionRisk[];
}

/** Persisted machine memory so hysteresis and dwell can be applied across ticks. */
export interface RiskMemory {
  state: RiskState;
  enteredAt: string;
  latchedEmergency: boolean;
  dailyPnlTriggerDay?: string;
}

export interface GovernorLimits {
  maxLeverage: Decimal;
  hfCaution: Decimal;
  hfDeleveraging: Decimal;
  hfEmergency: Decimal;
  postActionMinHf: Decimal;
  ldCaution: Decimal;
  smallPosition: boolean;
  correlated: boolean;
}

export interface TickResult {
  asOf: string;
  state: RiskState;
  previousState: RiskState;
  veto: boolean;
  recommendedAction: RecommendedAction;
  noDeployment: boolean;
  hurdle: Decimal;
  metrics: RiskObservation;
  triggers: RiskTrigger[];
  limits: GovernorLimits;
  notes: string[];
  mandated: MandatedIntent[];
  memory: RiskMemory;
  dwellHours: Decimal;
  transition: string;
}

export interface MandatedIntent {
  kind: ActionKind;
  reason: string;
}

export interface ExpectedPostState {
  healthFactor?: Decimal;
  leverage?: Decimal;
  reserveCoverage?: Decimal;
  grossAssetsUsd?: Decimal;
  equityUsd?: Decimal;
  debtUsd?: Decimal;
  ltv?: Decimal;
}

export interface ActionIntent {
  id: string;
  kind: ActionKind;
  venue?: string;
  notionalUsd: Decimal;
  maxSlippage?: Decimal;
  executionCostShare?: Decimal;
  expectedNetReturn?: Decimal;
  loopSteps?: number;
  riskIncreasing?: boolean;
  reducesRisk?: boolean;
  expectedPostState?: ExpectedPostState;
}

export interface Proposal {
  id: string;
  intents: ActionIntent[];
}

export interface IntentDecision {
  intentId: string;
  kind: ActionKind;
  decision: Decision;
  reasons: string[];
  modifiedNotionalUsd?: Decimal;
}

export interface EvaluationResult extends TickResult {
  proposalId: string | null;
  intents: IntentDecision[];
  decision: Decision;
}

export type FixtureName = 'normal' | 'caution' | 'deleveraging' | 'emergency';

/** CLI-compatible evaluation shape (packages/cli historically lived here). */
export interface RiskEvaluation {
  asOf: string;
  state: RiskState;
  veto: boolean;
  recommendedAction: RecommendedAction;
  noDeployment: boolean;
  hurdle: Decimal;
  metrics: {
    navUsd: Decimal;
    equityUsd: Decimal;
    debtUsd: Decimal;
    grossAssetsUsd: Decimal;
    leverage: Decimal | null;
    reserveHeldUsd: Decimal;
    reserveRequiredUsd: Decimal;
    reserveCoverage: Decimal | null;
    healthFactor: Decimal | null;
    correlated: boolean;
    smallPosition: boolean;
    drawdown: Decimal;
    dailyPnl: Decimal;
  };
  triggers: RiskTrigger[];
  limits: {
    maxLeverage: Decimal;
    hfCaution: Decimal;
    hfDeleveraging: Decimal;
    hfEmergency: Decimal;
  };
  notes: string[];
}
