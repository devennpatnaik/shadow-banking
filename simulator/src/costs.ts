import { d, ONE, ZERO, sum, type Decimal } from '@shadow-banking/core';
import type { CostInput, TxAction } from './types.js';

export function gasCost(costs: CostInput, actions: readonly TxAction[]): Decimal {
  return sum(actions.map((a) => costs.gasUsdPerAction[a] ?? ZERO));
}

/** Haircut applied when swapping borrow proceeds into more collateral. */
export function swapHaircut(costs: CostInput): Decimal {
  return ONE.minus(costs.swapFeeRate).minus(costs.slippageRate);
}

export function swapCostUsd(notional: Decimal, costs: CostInput): Decimal {
  return notional.mul(costs.swapFeeRate.plus(costs.slippageRate));
}

export function bridgeCost(notional: Decimal, costs: CostInput): Decimal {
  return costs.bridgingFixedUsd.plus(notional.mul(costs.bridgingRate));
}

/** Setup of the first supply: approve collateral, supply, enable E-mode. */
export const SETUP_ACTIONS: readonly TxAction[] = ['approve', 'supply', 'setEMode'];

/** One recursive loop: borrow, swap into collateral, supply. */
export const LOOP_ACTIONS: readonly TxAction[] = ['borrow', 'swap', 'supply'];

/** Conservative full unwind: swap remaining collateral, repay, withdraw. */
export const UNWIND_ACTIONS: readonly TxAction[] = ['swap', 'repay', 'withdraw'];

export function setupGasUsd(costs: CostInput): Decimal {
  return gasCost(costs, SETUP_ACTIONS);
}

export function loopGasUsd(costs: CostInput): Decimal {
  return gasCost(costs, LOOP_ACTIONS);
}

export function unwindGasUsd(costs: CostInput): Decimal {
  return gasCost(costs, UNWIND_ACTIONS);
}

export function zeroCost(network = 'test'): CostInput {
  const z = d(0);
  return {
    network,
    gasUsdPerAction: {
      approve: z,
      supply: z,
      borrow: z,
      repay: z,
      withdraw: z,
      swap: z,
      setEMode: z,
      bridge: z,
    },
    swapFeeRate: z,
    slippageRate: z,
    bridgingFixedUsd: z,
    bridgingRate: z,
    gasBasisLabel: 'zero (unit test)',
  };
}
