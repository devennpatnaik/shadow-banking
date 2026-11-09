import { ZERO, type Decimal } from '@shadow-banking/core';
import type { ComparisonResult, StrategyEvaluation } from '@shadow-banking/strategy';
import type { ActionIntent, Proposal, RiskState } from '@shadow-banking/risk';

function pick(result: ComparisonResult): StrategyEvaluation {
  const id = result.recommendation.strategyId;
  const found = result.evaluations.find((e) => e.id === id);
  if (!found) throw new Error(`missing evaluation ${id}`);
  return found;
}

/**
 * Reserve-first allocation. Deployment intents are only emitted when a non-preserve
 * strategy clears the hurdle and the book is in Normal. Otherwise: hold liquid.
 */
export function proposeFromComparison(args: {
  comparison: ComparisonResult;
  riskState: RiskState;
  step: number;
  alreadyDeployed: boolean;
}): Proposal {
  const rec = args.comparison.recommendation;
  const evaln = pick(args.comparison);
  const preserve = rec.action === 'preserve-capital' || !rec.clearsHurdle;
  const blocked = args.riskState !== 'Normal';
  const hold = preserve || blocked || args.alreadyDeployed;

  if (hold) {
    const intent: ActionIntent = {
      id: `s${args.step}-hold`,
      kind:
        args.riskState === 'Emergency'
          ? 'unwind'
          : args.riskState === 'Deleveraging'
            ? 'repay'
            : 'hold',
      notionalUsd: evaln.equityUsd,
      riskIncreasing: false,
      reducesRisk: args.riskState === 'Deleveraging' || args.riskState === 'Emergency',
    };
    const net = evaln.yield.estimatedNetApy;
    if (net !== undefined) intent.expectedNetReturn = net;
    return { id: `paper-${args.step}-hold`, intents: [intent] };
  }

  const intents: ActionIntent[] = [];
  const net = evaln.yield.estimatedNetApy;
  const deployUsd = evaln.deployedUsd.gt(0) ? evaln.deployedUsd : evaln.equityUsd;

  intents.push({
    id: `s${args.step}-swap`,
    kind: 'swap',
    notionalUsd: deployUsd,
    riskIncreasing: false,
    ...(net !== undefined ? { expectedNetReturn: net } : {}),
  });

  if (evaln.id === 'hold-lst' || evaln.id.startsWith('loop') || evaln.id === 'hedged-carry') {
    const stake: ActionIntent = {
      id: `s${args.step}-stake`,
      kind: 'stake',
      notionalUsd: deployUsd,
      riskIncreasing: true,
      expectedNetReturn: net,
    };
    intents.push(stake);
  }

  if (evaln.debtUsd.gt(0) && evaln.id.startsWith('loop')) {
    const steps = evaln.id === 'loop-3x' ? 2 : 1;
    intents.push({
      id: `s${args.step}-borrow`,
      kind: 'borrow',
      notionalUsd: evaln.debtUsd,
      riskIncreasing: true,
      expectedNetReturn: net,
      loopSteps: steps,
    });
  }

  if (evaln.id === 'hedged-carry') {
    intents.push({
      id: `s${args.step}-hedge`,
      kind: 'open_hedge',
      notionalUsd: deployUsd,
      riskIncreasing: true,
      expectedNetReturn: net,
    });
  }

  if (evaln.id === 'lp') {
    intents.push({
      id: `s${args.step}-lp`,
      kind: 'rebalance',
      notionalUsd: deployUsd,
      riskIncreasing: true,
      expectedNetReturn: net,
    });
  }

  if (intents.length === 1) {
    intents[0]!.kind = 'hold';
    intents[0]!.riskIncreasing = false;
  }

  return { id: `paper-${args.step}-deploy-${evaln.id}`, intents };
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
