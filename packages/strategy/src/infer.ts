import {
  pledgedHoldingIds,
  totalLiabilities,
  holdingValue,
  type BalanceSheet,
} from '@shadow-banking/core';
import type { LegKind } from './stack-types.js';

export interface StackLedgerView {
  getHoldings(): readonly {
    instrumentId: string;
    role: string;
    quantity: { gt(n: number): boolean };
  }[];
  getBorrows(): readonly { principal: { gt(n: number): boolean } }[];
}

export function inferActiveLegsFromBook(bs: BalanceSheet): LegKind[] {
  const kinds: LegKind[] = ['liquidity_reserve'];
  const pledged = pledgedHoldingIds(bs);
  const hasLst = bs.holdings.some(
    (h) => h.asset.isYieldBearing && !h.asset.isStable && holdingValue(h).gt(0),
  );
  if (hasLst) kinds.push('productive_asset');
  if (pledged.size > 0) kinds.push('collateral_post');
  const debt = totalLiabilities(bs);
  if (debt.gt(0)) kinds.push('borrow');
  const productiveUnpledged = bs.holdings.some(
    (h) =>
      h.asset.isYieldBearing && !h.asset.isStable && !pledged.has(h.id) && holdingValue(h).gt(0),
  );
  if (debt.gt(0) && productiveUnpledged) kinds.push('redeploy_borrowed');
  if (bs.contingentObligations.some((c) => c.kind === 'margin')) kinds.push('hedge');
  return kinds;
}

export function inferActiveLegsFromLedger(ledger: StackLedgerView): LegKind[] {
  const kinds: LegKind[] = ['liquidity_reserve'];
  const holdings = ledger.getHoldings();
  const hasLst = holdings.some((h) => h.instrumentId === 'wstETH' && h.quantity.gt(0));
  if (hasLst) kinds.push('productive_asset');
  if (holdings.some((h) => h.role === 'collateral' && h.quantity.gt(0)))
    kinds.push('collateral_post');
  const debt = ledger.getBorrows().some((b) => b.principal.gt(0));
  if (debt) kinds.push('borrow');
  if (
    debt &&
    holdings.some((h) => h.instrumentId === 'wstETH' && h.role === 'productive' && h.quantity.gt(0))
  ) {
    kinds.push('redeploy_borrowed');
  }
  return kinds;
}
