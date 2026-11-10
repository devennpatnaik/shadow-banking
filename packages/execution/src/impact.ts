import { d, toJsonNumber } from '@shadow-banking/core';
import type { RiskObservation } from '@shadow-banking/risk';
import type { AccountingImpact, ProposedAction } from './types.js';

function dec(v: { toString(): string } | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  return toJsonNumber(d(v.toString()));
}

export function accountingImpact(
  obs: RiskObservation,
  actions: readonly ProposedAction[],
): AccountingImpact {
  let debt = obs.debtUsd;
  let gross = obs.grossAssetsUsd;
  const reserves = obs.reserveHeldUsd;
  const nav = obs.navUsd;
  const notes: string[] = [];
  const holdOnly = actions.every((a) => a.functionName === 'hold' || a.kind === 'hold');

  if (holdOnly) {
    notes.push('Hold liquid: pre and post books are identical. No loop opened.');
  }

  for (const a of actions) {
    if (a.functionName === 'supply' || a.functionName === 'approve') {
      if (a.functionName === 'supply')
        notes.push(`Supply ${a.notionalUsd.toString()} ${a.tokenSymbol} as collateral (paper).`);
    } else if (a.functionName === 'borrow') {
      debt = debt.plus(a.notionalUsd);
      gross = gross.plus(a.notionalUsd);
      notes.push(`Borrow ${a.notionalUsd.toString()} ${a.tokenSymbol} (liability, not income).`);
    } else if (a.functionName === 'repay') {
      debt = debt.minus(a.notionalUsd);
      if (debt.isNegative()) debt = d(0);
      notes.push(`Repay ${a.notionalUsd.toString()} ${a.tokenSymbol}.`);
    } else if (a.functionName === 'withdraw') {
      notes.push(`Withdraw ${a.notionalUsd.toString()} ${a.tokenSymbol} from the pool.`);
    } else if (a.kind === 'open_hedge') {
      notes.push('Hedge stub: no on-book debt change in this phase.');
    }
  }

  const lev = obs.equityUsd.gt(0) ? gross.div(obs.equityUsd) : null;
  const preLev = obs.leverage;
  const postHf = obs.healthFactor;

  return {
    pre: {
      nav: obs.navUsd.toString(),
      equity: obs.equityUsd.toString(),
      debt: obs.debtUsd.toString(),
      reserves: obs.reserveHeldUsd.toString(),
      healthFactor: dec(obs.healthFactor),
      leverage: dec(preLev),
    },
    post: {
      nav: nav.toString(),
      equity: obs.equityUsd.toString(),
      debt: debt.toString(),
      reserves: reserves.toString(),
      healthFactor: dec(postHf),
      leverage: dec(lev),
    },
    notes,
  };
}
