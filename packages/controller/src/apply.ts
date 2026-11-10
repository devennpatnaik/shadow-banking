import type { Ledger } from '@shadow-banking/accounting';
import { Decimal, d, min } from '@shadow-banking/core';
import type { EvaluationResult, Proposal } from '@shadow-banking/risk';
import { workingCashId } from './seed.js';

function approvedIds(evaluation: EvaluationResult): Set<string> {
  return new Set(
    evaluation.intents
      .filter((i) => i.decision === 'approve' || i.decision === 'approve_modified')
      .map((i) => i.intentId),
  );
}

function modifiedNotional(
  evaluation: EvaluationResult,
  intentId: string,
  fallback: Decimal,
): Decimal {
  const row = evaluation.intents.find((i) => i.intentId === intentId);
  return row?.modifiedNotionalUsd ?? fallback;
}

export function hasDeployedPositions(ledger: Ledger): boolean {
  return (
    ledger.getHoldings().some((h) => h.role === 'productive' || h.role === 'collateral') ||
    ledger.getBorrows().some((b) => b.principal.gt(0))
  );
}

function findWst(ledger: Ledger, role?: string) {
  return ledger.findHolding(
    (h) =>
      h.instrumentId === 'wstETH' && h.quantity.gt(0) && (role === undefined || h.role === role),
  );
}

/**
 * Apply only governor-approved intents, one stack leg at a time. No signing, no broadcast.
 */
export function applyApprovedPaperActions(args: {
  at: string;
  ledger: Ledger;
  proposal: Proposal;
  evaluation: EvaluationResult;
  lstPrice: Decimal;
  borrowApr: Decimal;
}): { applied: boolean; memos: string[] } {
  const memos: string[] = [];
  if (args.evaluation.decision === 'reject' || args.evaluation.veto) {
    memos.push('Governor veto/reject: no hypothetical execution.');
    return { applied: false, memos };
  }
  const ok = approvedIds(args.evaluation);
  const approved = args.proposal.intents.filter((i) => ok.has(i.id));
  if (approved.length === 0) {
    memos.push('No approved intents.');
    return { applied: false, memos };
  }

  const kinds = new Set(approved.map((i) => i.kind));
  if (
    [...kinds].every((k) => k === 'hold' || k === 'repay' || k === 'unwind') &&
    !kinds.has('stake') &&
    !kinds.has('borrow') &&
    !kinds.has('add_collateral') &&
    !kinds.has('open_hedge')
  ) {
    memos.push('Hold liquid / mandated reduce: no new stack leg posted.');
    applyMandatedRepay(args);
    return { applied: false, memos };
  }

  const cashId = workingCashId(args.ledger);
  const cash = args.ledger.findHolding((h) => h.id === cashId);
  if (!cash) {
    memos.push('No working cash; holding liquid.');
    return { applied: false, memos };
  }

  if (kinds.has('add_collateral')) {
    const h = findWst(args.ledger, 'productive') ?? findWst(args.ledger);
    if (!h || h.role === 'collateral') {
      memos.push('Nothing to pledge.');
      return { applied: false, memos };
    }
    args.ledger.pledge({
      at: args.at,
      holdingId: h.id,
      collateralPositionId: 'paper-aave-wsteth',
    });
    memos.push('Paper pledged wstETH as collateral (same asset; equity not double-counted).');
    return { applied: true, memos };
  }

  if (kinds.has('borrow')) {
    const borrowIntent = approved.find((i) => i.kind === 'borrow');
    const debt = borrowIntent
      ? modifiedNotional(args.evaluation, borrowIntent.id, borrowIntent.notionalUsd)
      : d(0);
    if (debt.lte(0)) {
      memos.push('Zero borrow size.');
      return { applied: false, memos };
    }
    args.ledger.borrow({
      at: args.at,
      amount: debt,
      instrumentId: 'USDC',
      venueAccountId: 'aave',
      cashVenueAccountId: 'wallet',
      apr: args.borrowApr,
      venue: 'Aave v3 paper',
      intentHash: `paper-borrow-${args.proposal.id}`,
    });
    memos.push(`Paper borrow ${debt.toFixed(2)} USDC (principal is not income).`);
    return { applied: true, memos };
  }

  if (kinds.has('open_hedge')) {
    memos.push('Paper hedge is recorded as a stack leg only (no live Hyperliquid order).');
    return { applied: true, memos };
  }

  if (kinds.has('stake') || kinds.has('swap')) {
    const stake =
      approved.find((i) => i.kind === 'stake') ?? approved.find((i) => i.kind === 'swap');
    const want = stake ? modifiedNotional(args.evaluation, stake.id, stake.notionalUsd) : d(0);
    const budget = cash.quantity;
    const spend = want.gt(0) ? min(want, budget) : budget;
    const qty = args.lstPrice.gt(0)
      ? min(spend, cash.quantity).div(args.lstPrice).toDecimalPlaces(8, Decimal.ROUND_DOWN)
      : d(0);
    if (qty.lte(0) || spend.lte(0)) {
      memos.push('Nothing to acquire; holding liquid.');
      return { applied: false, memos };
    }
    args.ledger.acquire({
      at: args.at,
      instrumentId: 'wstETH',
      quantity: qty,
      price: args.lstPrice,
      cashHoldingId: cashId,
      venueAccountId: 'aave',
      role: 'productive',
      source: 'paper-controller',
    });
    memos.push(`Paper acquire ${qty.toFixed(6)} wstETH (hypothetical stack leg).`);
    return { applied: true, memos };
  }

  memos.push('No mapped stack-leg intent.');
  return { applied: false, memos };
}

function applyMandatedRepay(args: {
  at: string;
  ledger: Ledger;
  evaluation: EvaluationResult;
}): void {
  const mandated = args.evaluation.mandated.some((m) => m.kind === 'repay' || m.kind === 'unwind');
  if (!mandated) return;
  const borrow = args.ledger.getBorrows()[0];
  if (!borrow) return;
  const cash = args.ledger.findHolding(
    (h) => h.instrumentId === borrow.instrumentId && h.quantity.gt(0),
  );
  if (!cash) return;
  const owed = borrow.principal.plus(borrow.accruedInterest);
  const pay = cash.quantity.lt(owed) ? cash.quantity : owed;
  if (pay.lte(0)) return;
  args.ledger.repay({
    at: args.at,
    borrowId: borrow.id,
    amount: pay,
    cashHoldingId: cash.id,
    intentHash: `paper-repay-${args.at}`,
  });
}

export function accruePaperDay(args: {
  at: string;
  ledger: Ledger;
  days: number;
  lstYieldApy: Decimal;
  usdcSupplyApy: Decimal;
}): void {
  if (args.days <= 0) return;
  const frac = d(args.days).div(365);
  const wst = args.ledger.findHolding((h) => h.instrumentId === 'wstETH' && h.quantity.gt(0));
  if (wst) {
    const px = args.ledger.priceOf('wstETH');
    const addQty = wst.quantity.mul(args.lstYieldApy).mul(frac);
    if (addQty.gt(0)) {
      args.ledger.creditIncome({
        at: args.at,
        kind: 'staking',
        quantity: addQty,
        amount: addQty.mul(px),
        instrumentId: 'wstETH',
        holdingId: wst.id,
        memo: `Paper staking accrual ${args.days}d (hypothetical)`,
      });
    }
  }
  const lending = args.ledger.findHolding((h) => h.role === 'lending' && h.instrumentId === 'USDC');
  if (lending) {
    const amt = lending.quantity.mul(args.usdcSupplyApy).mul(frac);
    if (amt.gt(0)) {
      args.ledger.creditIncome({
        at: args.at,
        kind: 'lending',
        amount: amt,
        instrumentId: 'USDC',
        holdingId: lending.id,
        memo: `Paper lending accrual ${args.days}d (hypothetical)`,
      });
    }
  }
  for (const b of args.ledger.getBorrows()) {
    args.ledger.accrueInterest({ at: args.at, borrowId: b.id, days: args.days });
  }
}
