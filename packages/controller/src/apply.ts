import type { Ledger } from '@shadow-banking/accounting';
import { d, type Decimal } from '@shadow-banking/core';
import type { ComparisonResult, StrategyEvaluation } from '@shadow-banking/strategy';
import type { EvaluationResult, Proposal } from '@shadow-banking/risk';
import { workingCashId } from './seed.js';

function chosen(result: ComparisonResult): StrategyEvaluation {
  const found = result.evaluations.find((e) => e.id === result.recommendation.strategyId);
  if (!found) throw new Error('strategy evaluation missing');
  return found;
}

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

/**
 * Apply only governor-approved intents to the paper ledger. Rejected / vetoed
 * intents are never posted. No signing, no broadcast.
 */
export function applyApprovedPaperActions(args: {
  at: string;
  ledger: Ledger;
  proposal: Proposal;
  evaluation: EvaluationResult;
  comparison: ComparisonResult;
  lstPrice: Decimal;
  borrowApr: Decimal;
}): { applied: boolean; memos: string[] } {
  const memos: string[] = [];
  if (args.evaluation.decision === 'reject' || args.evaluation.veto) {
    memos.push('Governor veto/reject: no hypothetical execution.');
    return { applied: false, memos };
  }
  const ok = approvedIds(args.evaluation);
  const deployIntents = args.proposal.intents.filter(
    (i) =>
      ok.has(i.id) &&
      (i.kind === 'stake' || i.kind === 'borrow' || i.kind === 'open_hedge' || i.kind === 'swap'),
  );
  const riskOn = deployIntents.some(
    (i) => i.riskIncreasing || i.kind === 'borrow' || i.kind === 'stake',
  );
  if (!riskOn) {
    memos.push('Hold liquid: no deployment posted to the ledger.');
    applyMandatedRepay(args);
    return { applied: false, memos };
  }
  if (hasDeployedPositions(args.ledger)) {
    memos.push('Already deployed; paper loop does not add leverage automatically.');
    return { applied: false, memos };
  }

  const pick = chosen(args.comparison);
  const cashId = workingCashId(args.ledger);
  const cash = args.ledger.findHolding((h) => h.id === cashId);
  if (!cash) {
    memos.push('No working cash; holding liquid.');
    return { applied: false, memos };
  }
  const fee = pick.oneOffCostsUsd.div(2);
  const budget = fee.gt(0) ? cash.quantity.minus(fee) : cash.quantity;
  const want = pick.equityUsd.gt(0) ? pick.equityUsd : pick.deployedUsd;
  const spend = want.lt(budget) ? want : budget;
  const qty = args.lstPrice.gt(0) ? spend.div(args.lstPrice) : d(0);
  if (qty.lte(0) || spend.lte(0) || budget.lte(0)) {
    memos.push('Nothing to acquire; holding liquid.');
    return { applied: false, memos };
  }

  const acquired = args.ledger.acquire({
    at: args.at,
    instrumentId: 'wstETH',
    quantity: qty,
    price: args.lstPrice,
    cashHoldingId: cashId,
    venueAccountId: 'aave',
    role: 'productive',
    ...(fee.gt(0) ? { fee, feeHoldingId: cashId } : {}),
    source: 'paper-controller',
  });
  memos.push(`Paper acquire ${qty.toFixed(6)} wstETH (hypothetical).`);

  const wantsLoop = args.proposal.intents.some((i) => i.kind === 'borrow' && ok.has(i.id));
  if (wantsLoop) {
    args.ledger.pledge({
      at: args.at,
      holdingId: acquired.holdingId,
      collateralPositionId: 'paper-aave-wsteth',
    });
    const borrowIntent = args.proposal.intents.find((i) => i.kind === 'borrow');
    const debt = borrowIntent
      ? modifiedNotional(args.evaluation, borrowIntent.id, pick.debtUsd)
      : pick.debtUsd;
    if (debt.gt(0)) {
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
    }
  }

  return { applied: true, memos };
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
