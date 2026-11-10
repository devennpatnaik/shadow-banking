import type { Decimal } from '@shadow-banking/core';
import type { CapitalPlan, YieldStack } from './types.js';

/** Concurrent techniques on the same equity. Reserve-only is hold-liquid, not a brand. */
export type LegKind =
  | 'liquidity_reserve'
  | 'productive_asset'
  | 'collateral_post'
  | 'borrow'
  | 'redeploy_borrowed'
  | 'hedge';

export const LEG_ORDER: readonly LegKind[] = [
  'liquidity_reserve',
  'productive_asset',
  'collateral_post',
  'borrow',
  'redeploy_borrowed',
  'hedge',
] as const;

export interface StackLeg {
  id: string;
  order: number;
  kind: LegKind;
  label: string;
  assetSymbol: string;
  /** Owner equity tied to this technique (0 when the leg reuses already-counted equity). */
  ownerEquityUsd: Decimal;
  borrowedCapitalUsd: Decimal;
  notionalUsd: Decimal;
  incomeUsd: Decimal;
  financingUsd: Decimal;
  executionUsd: Decimal;
  expectedLossUsd: Decimal;
  estimatedNetUsd: Decimal;
  estimatedNetApy: Decimal;
  marginalNetUsd: Decimal;
  marginalNetApy: Decimal;
  healthFactor: Decimal | null;
  liquidationDistance: Decimal | null;
  leverage: Decimal;
  notes: string[];
}

export interface ProposedStackLeg {
  kind: LegKind;
  label: string;
  marginalNetApy: Decimal | null;
  reason: string;
}

export type StackAction = 'hold_liquid' | 'operate_paper';

export interface CapitalStack {
  snapshotDate: string;
  hurdleApy: Decimal;
  horizonDays: number;
  capital: CapitalPlan;
  seedUsd: Decimal;
  ownerEquityUsd: Decimal;
  borrowedCapitalUsd: Decimal;
  reserveUsd: Decimal;
  productiveUsd: Decimal;
  collateralUsd: Decimal;
  idleBorrowedUsd: Decimal;
  debtUsd: Decimal;
  hedgeNotionalUsd: Decimal;
  navUsd: Decimal;
  healthFactor: Decimal | null;
  liquidationDistance: Decimal | null;
  leverage: Decimal;
  legs: StackLeg[];
  consolidated: YieldStack;
  consolidatedNetApy: Decimal;
  clearsHurdle: boolean;
  /** True when the only active technique is the liquidity reserve. */
  noDeployment: boolean;
  recommendedAction: StackAction;
  stopReason: string;
  nextProposedLeg: ProposedStackLeg | null;
  warnings: string[];
}

export interface StackStepIntent {
  id: string;
  kind: 'hold' | 'swap' | 'stake' | 'add_collateral' | 'borrow' | 'open_hedge';
  notionalUsd: Decimal;
  riskIncreasing: boolean;
  expectedNetReturn?: Decimal;
  loopSteps?: number;
  expectedPostState?: {
    healthFactor?: Decimal;
    leverage?: Decimal;
    equityUsd?: Decimal;
    debtUsd?: Decimal;
  };
}

export interface StackStepProposal {
  id: string;
  leg: StackLeg | null;
  stop: boolean;
  stopReason: string;
  intents: StackStepIntent[];
}
