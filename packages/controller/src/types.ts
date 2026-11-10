import type { Ledger } from '@shadow-banking/accounting';
import type { Decimal } from '@shadow-banking/core';
import type {
  CapitalStack,
  ComparisonResult,
  FundingBasis,
  LegKind,
  StrategyId,
} from '@shadow-banking/strategy';
import type {
  ActionIntent,
  EvaluationResult,
  Proposal,
  RecommendedAction,
  RiskMemory,
  RiskState,
} from '@shadow-banking/risk';

export type PaperPosture = 'hold_liquid' | 'deployed';

export type ClockUnit = 'day' | 'step';

export interface PaperRunConfig {
  steps: number;
  seedUsd: Decimal;
  hurdleApy: Decimal;
  snapshotPath: string;
  provider: 'fixture' | 'live';
  network: string;
  lstSymbol: string;
  borrowSymbol: string;
  fundingBasis: FundingBasis;
  clockUnit: ClockUnit;
  stepDays: number;
  stateDir: string;
  reserveRate: Decimal;
}

export interface PaperStepRecord {
  step: number;
  at: string;
  snapshotDate: string;
  posture: PaperPosture;
  strategyId: StrategyId | 'stack';
  legs: LegKind[];
  nextLeg: LegKind | null;
  recommendedAction: RecommendedAction;
  noDeployment: boolean;
  clearsHurdle: boolean;
  riskState: RiskState;
  veto: boolean;
  executed: boolean;
  proposalId: string;
  intents: { id: string; kind: string; decision: string; reasons: string[] }[];
  nav: Decimal;
  debt: Decimal;
  income: Decimal;
  costs: Decimal;
  drawdown: Decimal;
  reasons: string[];
}

export interface PaperRunResult {
  config: PaperRunConfig;
  startedAt: string;
  endedAt: string;
  steps: PaperStepRecord[];
  posture: PaperPosture;
  headline: string;
  veto: boolean;
  noDeployment: boolean;
  recommendedAction: RecommendedAction;
  nav: Decimal;
  debt: Decimal;
  income: Decimal;
  costs: Decimal;
  drawdown: Decimal;
  ledger: Ledger;
  lastComparison: ComparisonResult | null;
  lastStack: CapitalStack | null;
  lastEvaluation: EvaluationResult | null;
  riskMemory: RiskMemory;
  stateDir: string;
}

export interface PaperLoopInput {
  steps: number;
  seedUsd: Decimal;
  hurdleApy?: Decimal;
  snapshotPath?: string;
  provider?: 'fixture' | 'live';
  network?: string;
  lstSymbol?: string;
  borrowSymbol?: string;
  fundingBasis?: FundingBasis;
  clockUnit?: ClockUnit;
  stepDays?: number;
  stateDir?: string;
  reserveRate?: Decimal;
  resume?: boolean;
  /** Test hook: replace the built proposal before the governor sees it. */
  mutateProposal?: (proposal: Proposal, ctx: { step: number }) => Proposal;
  /** Test hook: start from an existing ledger instead of an idle seed. */
  ledger?: Ledger;
  now?: string;
}

export type { ActionIntent, Proposal, EvaluationResult };
