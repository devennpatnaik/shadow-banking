import type { Decimal } from '@shadow-banking/core';
import type {
  ActionIntent,
  Decision,
  EvaluationResult,
  IntentDecision,
  Proposal,
  RecommendedAction,
  RiskState,
} from '@shadow-banking/risk';

export type ExecutionStatus = 'draft' | 'approved' | 'rejected' | 'vetoed';

export type VenueId = 'aave-v3' | 'hyperliquid' | 'none';

export type AaveFunction = 'supply' | 'borrow' | 'repay' | 'withdraw' | 'approve';

export type SimulatorId = 'mock' | 'eth_simulateV1';

export interface SdkCallDescriptor {
  package: string;
  method: string;
  args: Record<string, string | number | boolean | null>;
}

export interface CalldataDescriptor {
  to: string;
  selector: string;
  signature: string;
  args: string[];
  data: string;
  valueWei: string;
}

export interface ProposedAction {
  id: string;
  intentId: string;
  venue: VenueId;
  kind: ActionIntent['kind'];
  functionName: string;
  notionalUsd: Decimal;
  tokenSymbol: string;
  tokenAddress: string | null;
  network: string;
  sdk: SdkCallDescriptor;
  calldata: CalldataDescriptor | null;
  estimatedGas: string;
  estimatedGasUsd: string;
  notes: string[];
}

export interface SimulationCallResult {
  actionId: string;
  ok: boolean;
  gasUsed: string;
  returnData: string | null;
  error: string | null;
}

export interface SimulationBundle {
  simulator: SimulatorId;
  ok: boolean;
  dryRun: true;
  rpcUrlSet: boolean;
  gasUsed: string;
  estimatedGasUsd: string;
  calls: SimulationCallResult[];
  notes: string[];
}

export interface AccountingImpact {
  pre: {
    nav: string;
    equity: string;
    debt: string;
    reserves: string;
    healthFactor: string | null;
    leverage: string | null;
  };
  post: {
    nav: string;
    equity: string;
    debt: string;
    reserves: string;
    healthFactor: string | null;
    leverage: string | null;
  };
  notes: string[];
}

export interface UnwindStep {
  order: number;
  kind: ActionIntent['kind'];
  venue: VenueId;
  functionName: string;
  note: string;
}

export interface UnwindPlan {
  summary: string;
  usesT2Liquidity: false;
  steps: UnwindStep[];
}

export interface PolicyCheck {
  ok: boolean;
  allowlistOk: boolean;
  spendingOk: boolean;
  reasons: string[];
  config: {
    allowlistEnabled: boolean;
    spendingEnabled: boolean;
    perTxUsdMax: string;
    perDayUsdMax: string;
  };
}

export interface ExecutionProposal {
  id: string;
  status: ExecutionStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  intentProposal: Proposal;
  actions: ProposedAction[];
  simulation: SimulationBundle;
  accounting: AccountingImpact;
  unwind: UnwindPlan;
  policy: PolicyCheck;
  riskState: RiskState;
  recommendedAction: RecommendedAction;
  noDeployment: boolean;
  hurdle: string;
  veto: boolean;
  governorDecision: Decision;
  governorIntents: IntentDecision[];
  governorNotes: string[];
  userApproval: {
    required: true;
    boundToId: string;
    broadcasts: false;
    note: string;
  };
}

export interface ExecutionPolicyConfig {
  allowlistEnabled: boolean;
  spendingEnabled: boolean;
  allowedTargets: string[];
  allowedSignatures: string[];
  allowedVenues: VenueId[];
  perTxUsdMax: Decimal;
  perDayUsdMax: Decimal;
  spentTodayUsd: Decimal;
}

export type { ActionIntent, EvaluationResult, Proposal };
