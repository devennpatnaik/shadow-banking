import type { ProposedAction, UnwindPlan, UnwindStep } from './types.js';

export function unwindPlan(actions: readonly ProposedAction[]): UnwindPlan {
  const holdOnly = actions.every((a) => a.kind === 'hold' || a.functionName === 'hold');
  if (holdOnly) {
    return {
      summary: 'Already liquid. No unwind steps.',
      usesT2Liquidity: false,
      steps: [],
    };
  }

  const steps: UnwindStep[] = [];
  let order = 1;
  const hasHedge = actions.some((a) => a.venue === 'hyperliquid' && a.kind === 'open_hedge');
  const hasBorrow = actions.some((a) => a.functionName === 'borrow');
  const hasSupply = actions.some((a) => a.functionName === 'supply');

  if (hasHedge) {
    steps.push({
      order: order++,
      kind: 'close_hedge',
      venue: 'hyperliquid',
      functionName: 'close_hedge',
      note: 'Close isolated ETH perp reduceOnly. Stub in Phase 5; never T2.',
    });
  }
  if (hasBorrow) {
    steps.push({
      order: order++,
      kind: 'repay',
      venue: 'aave-v3',
      functionName: 'repay',
      note: 'Repay variable WETH debt on Aave v3 Pool, then withdraw collateral.',
    });
  }
  if (hasSupply) {
    steps.push({
      order: order++,
      kind: 'withdraw',
      venue: 'aave-v3',
      functionName: 'withdraw',
      note: 'Withdraw wstETH collateral to the user address. No Lido queue (T2) in emergency.',
    });
  }
  if (steps.length === 0) {
    steps.push({
      order: 1,
      kind: 'unwind',
      venue: 'none',
      functionName: 'hold',
      note: 'Return to liquid reserves. No T2 redemption.',
    });
  }

  return {
    summary: 'Reverse the proposal without T2 liquidity: close hedge, repay, withdraw.',
    usesT2Liquidity: false,
    steps,
  };
}
