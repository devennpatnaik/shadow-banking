import { holdingValue, liabilityValue, pledgedHoldingIds, capitalSplit } from './balance-sheet.js';
import { ZERO, type Decimal } from './money.js';
import type { BalanceSheet, Holding } from './model.js';

/**
 * Simultaneous uses of the same asset (spec §2C / §3). A pledged LST is still one
 * equity dollar: it can yield, sit as collateral, and be borrowed against without
 * counting that equity twice.
 */
export type CapitalUseKind =
  'liquid_reserve' | 'productive_yield' | 'collateral' | 'borrowed_against' | 'borrowed_proceeds';

export interface AssetUse {
  holdingId: string;
  symbol: string;
  fairValue: Decimal;
  uses: CapitalUseKind[];
  /** Owner equity attributed to this holding; sums to NAV across rows. */
  ownerEquityUsd: Decimal;
  /** Borrowed capital financed against or sitting in this holding. */
  borrowedUsd: Decimal;
}

export interface CapitalUsesReport {
  ownerEquityUsd: Decimal;
  borrowedCapitalUsd: Decimal;
  grossAssetsUsd: Decimal;
  assets: AssetUse[];
  note: string;
}

function usesFor(h: Holding, pledged: Set<string>, hasDebt: boolean): CapitalUseKind[] {
  const uses: CapitalUseKind[] = [];
  if (h.asset.isYieldBearing) uses.push('productive_yield');
  if (pledged.has(h.id)) {
    uses.push('collateral');
    if (hasDebt) uses.push('borrowed_against');
  }
  if (!pledged.has(h.id) && (h.asset.isStable || h.asset.liquidityTier === 'T0')) {
    uses.push('liquid_reserve');
  }
  if (!h.asset.isYieldBearing && !h.asset.isStable && !pledged.has(h.id)) {
    uses.push('borrowed_proceeds');
  }
  return uses;
}

/**
 * Per-holding uses of capital. Owner equity is allocated first (never double-counted);
 * leftover holding value is treated as borrowed proceeds.
 */
export function usesOfCapital(bs: BalanceSheet): CapitalUsesReport {
  const split = capitalSplit(bs);
  const pledged = pledgedHoldingIds(bs);
  const hasDebt = split.borrowedCapital.gt(0);
  let remainingOwner = split.ownerCapital;
  const assets: AssetUse[] = [];
  for (const h of bs.holdings) {
    const fairValue = holdingValue(h);
    const ownerEquityUsd = fairValue.lte(remainingOwner) ? fairValue : remainingOwner;
    remainingOwner = remainingOwner.minus(ownerEquityUsd);
    const borrowedUsd = fairValue.minus(ownerEquityUsd);
    assets.push({
      holdingId: h.id,
      symbol: h.asset.symbol,
      fairValue,
      uses: usesFor(h, pledged, hasDebt),
      ownerEquityUsd,
      borrowedUsd,
    });
  }
  return {
    ownerEquityUsd: split.ownerCapital,
    borrowedCapitalUsd: split.borrowedCapital,
    grossAssetsUsd: split.grossAssets,
    assets,
    note: 'Same holding may list several uses. Owner equity is attributed once; borrowed principal is not income.',
  };
}

export function liabilityUses(bs: BalanceSheet): { id: string; symbol: string; value: Decimal }[] {
  return bs.liabilities.map((l) => ({
    id: l.id,
    symbol: l.symbol,
    value: liabilityValue(l),
  }));
}

export { ZERO };
