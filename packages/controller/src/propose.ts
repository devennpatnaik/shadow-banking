import { ZERO, type Decimal } from '@shadow-banking/core';
import {
  nextStackStepProposal,
  type CapitalStack,
  type LegKind,
  type StackStepIntent,
} from '@shadow-banking/strategy';
import type { ActionIntent, Proposal, RiskState } from '@shadow-banking/risk';

function toIntent(row: StackStepIntent): ActionIntent {
  const intent: ActionIntent = {
    id: row.id,
    kind: row.kind,
    notionalUsd: row.notionalUsd,
    riskIncreasing: row.riskIncreasing,
  };
  if (row.expectedNetReturn !== undefined) intent.expectedNetReturn = row.expectedNetReturn;
  if (row.loopSteps !== undefined) intent.loopSteps = row.loopSteps;
  if (row.expectedPostState) intent.expectedPostState = row.expectedPostState;
  return intent;
}

/**
 * Prefer extending the composed stack by one concurrent leg over picking a
 * mutually exclusive strategy id.
 */
export function proposeFromStack(args: {
  stack: CapitalStack;
  active: readonly LegKind[];
  riskState: RiskState;
  step: number;
}): Proposal {
  if (args.riskState !== 'Normal') {
    const kind =
      args.riskState === 'Emergency'
        ? 'unwind'
        : args.riskState === 'Deleveraging'
          ? 'repay'
          : 'hold';
    const intent: ActionIntent = {
      id: `s${args.step}-${kind}`,
      kind,
      notionalUsd: args.stack.ownerEquityUsd,
      riskIncreasing: false,
      reducesRisk: args.riskState === 'Deleveraging' || args.riskState === 'Emergency',
    };
    return { id: `paper-${args.step}-${kind}`, intents: [intent] };
  }
  const step = nextStackStepProposal(args.stack, args.active, args.step);
  return { id: step.id, intents: step.intents.map(toIntent) };
}

/** @deprecated diagnostic path — paper loop uses proposeFromStack. */
export function proposeFromComparison(args: {
  stack?: CapitalStack;
  active?: readonly LegKind[];
  comparison?: { recommendation: { action: string; strategyId: string; clearsHurdle: boolean } };
  riskState: RiskState;
  step: number;
  alreadyDeployed?: boolean;
}): Proposal {
  if (args.stack) {
    return proposeFromStack({
      stack: args.stack,
      active: args.active ?? [],
      riskState: args.riskState,
      step: args.step,
    });
  }
  const intent: ActionIntent = {
    id: `s${args.step}-hold`,
    kind: 'hold',
    notionalUsd: ZERO,
    riskIncreasing: false,
  };
  return { id: `paper-${args.step}-hold`, intents: [intent] };
}

export function isRiskIncreasingProposal(proposal: Proposal): boolean {
  return proposal.intents.some(
    (i) =>
      i.riskIncreasing === true ||
      i.kind === 'borrow' ||
      i.kind === 'stake' ||
      i.kind === 'open_hedge' ||
      i.kind === 'compound',
  );
}

export function notionalSum(intents: readonly ActionIntent[]): Decimal {
  return intents.reduce((s, i) => s.plus(i.notionalUsd), ZERO);
}
