import { ZERO } from '@shadow-banking/core';
import type { CapitalStack, LegKind, StackStepIntent, StackStepProposal } from './stack-types.js';
import { nextLeg } from './compose.js';

function post(stack: CapitalStack, kind: LegKind) {
  const leg = stack.legs.find((l) => l.kind === kind);
  const hf = leg?.healthFactor ?? null;
  const withDebt = kind === 'borrow' || kind === 'redeploy_borrowed';
  return {
    ...(hf ? { healthFactor: hf } : {}),
    leverage: leg?.leverage ?? stack.leverage,
    equityUsd: stack.ownerEquityUsd,
    ...(withDebt ? { debtUsd: stack.debtUsd } : {}),
  };
}

export function intentsForLeg(stack: CapitalStack, kind: LegKind, step: number): StackStepIntent[] {
  const leg = stack.legs.find((l) => l.kind === kind);
  const notional = leg?.notionalUsd ?? ZERO;
  const net = stack.consolidatedNetApy;
  const id = `s${step}-${kind}`;
  switch (kind) {
    case 'liquidity_reserve':
      return [
        {
          id: `${id}-hold`,
          kind: 'hold',
          notionalUsd: notional,
          riskIncreasing: false,
        },
      ];
    case 'productive_asset':
      return [
        {
          id: `${id}-swap`,
          kind: 'swap',
          notionalUsd: notional,
          riskIncreasing: false,
          expectedNetReturn: net,
          expectedPostState: post(stack, kind),
        },
        {
          id: `${id}-stake`,
          kind: 'stake',
          notionalUsd: notional,
          riskIncreasing: true,
          expectedNetReturn: net,
          expectedPostState: post(stack, kind),
        },
      ];
    case 'collateral_post':
      return [
        {
          id: `${id}-post`,
          kind: 'add_collateral',
          notionalUsd: notional,
          riskIncreasing: false,
          expectedNetReturn: net,
        },
      ];
    case 'borrow':
      return [
        {
          id: `${id}-borrow`,
          kind: 'borrow',
          notionalUsd: notional,
          riskIncreasing: true,
          expectedNetReturn: net,
          loopSteps: 1,
          expectedPostState: post(stack, kind),
        },
      ];
    case 'redeploy_borrowed':
      return [
        {
          id: `${id}-swap`,
          kind: 'swap',
          notionalUsd: notional,
          riskIncreasing: false,
          expectedNetReturn: net,
          expectedPostState: post(stack, kind),
        },
        {
          id: `${id}-stake`,
          kind: 'stake',
          notionalUsd: notional,
          riskIncreasing: true,
          expectedNetReturn: net,
          expectedPostState: post(stack, kind),
        },
      ];
    case 'hedge':
      return [
        {
          id: `${id}-hedge`,
          kind: 'open_hedge',
          notionalUsd: notional,
          riskIncreasing: true,
          expectedNetReturn: net,
          expectedPostState: post(stack, kind),
        },
      ];
  }
}

export function nextStackStepProposal(
  stack: CapitalStack,
  active: readonly LegKind[],
  step = 1,
): StackStepProposal {
  const leg = nextLeg(stack, active);
  if (!leg) {
    return {
      id: `stack-${step}-hold`,
      leg: null,
      stop: true,
      stopReason: stack.stopReason,
      intents: [
        {
          id: `s${step}-hold`,
          kind: 'hold',
          notionalUsd: stack.reserveUsd,
          riskIncreasing: false,
        },
      ],
    };
  }
  return {
    id: `stack-${step}-${leg.kind}`,
    leg,
    stop: false,
    stopReason: stack.stopReason,
    intents: intentsForLeg(stack, leg.kind, step),
  };
}
