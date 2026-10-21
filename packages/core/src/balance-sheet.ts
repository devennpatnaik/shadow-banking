import { d, max0, sum, ZERO, ONE, type Decimal } from './money.js';
import type {
  AccountScope,
  BalanceSheet,
  CollateralPosition,
  Holding,
  Liability,
  LiquidityTier,
} from './model.js';
import { LIQUIDITY_TIERS } from './model.js';

// ---------------------------------------------------------------------------------------------
// Valuation
// ---------------------------------------------------------------------------------------------

export function holdingValue(h: Holding): Decimal {
  return h.quantity.mul(h.priceMark);
}

/** Outstanding debt including accrued interest, in reporting currency. */
export function liabilityValue(l: Liability): Decimal {
  return l.principal.plus(l.accruedInterest).mul(l.priceMark);
}

export function totalAssets(bs: BalanceSheet): Decimal {
  return sum(bs.holdings.map(holdingValue));
}

export function totalLiabilities(bs: BalanceSheet): Decimal {
  return sum(bs.liabilities.map(liabilityValue));
}

/** NAV = fair value of assets − liabilities (spec §8). Contingent obligations are reported, not netted. */
export function nav(bs: BalanceSheet): Decimal {
  return totalAssets(bs).minus(totalLiabilities(bs));
}

export interface CapitalSplit {
  /** User-owned capital = equity = NAV. */
  ownerCapital: Decimal;
  /** Borrowed capital = total liabilities. Never income, never equity. */
  borrowedCapital: Decimal;
  grossAssets: Decimal;
  /** Gross assets / equity. null when equity <= 0 (undefined leverage). */
  leverage: Decimal | null;
  /** Borrowed share of gross assets. */
  borrowedShareOfAssets: Decimal | null;
}

export function capitalSplit(bs: BalanceSheet): CapitalSplit {
  const grossAssets = totalAssets(bs);
  const borrowedCapital = totalLiabilities(bs);
  const ownerCapital = grossAssets.minus(borrowedCapital);
  return {
    ownerCapital,
    borrowedCapital,
    grossAssets,
    leverage: ownerCapital.gt(0) ? grossAssets.div(ownerCapital) : null,
    borrowedShareOfAssets: grossAssets.gt(0) ? borrowedCapital.div(grossAssets) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Liquidity tiers
// ---------------------------------------------------------------------------------------------

export function pledgedHoldingIds(bs: BalanceSheet): Set<string> {
  const ids = new Set<string>();
  for (const pos of bs.collateralPositions) for (const c of pos.collateral) ids.add(c.holdingId);
  return ids;
}

/** A pledged holding is T3 regardless of its intrinsic tier. */
export function effectiveTier(h: Holding, pledged: Set<string>): LiquidityTier {
  return pledged.has(h.id) ? 'T3' : h.asset.liquidityTier;
}

export type TierTotals = Record<LiquidityTier, Decimal>;

function emptyTiers(): TierTotals {
  return { T0: ZERO, T1: ZERO, T2: ZERO, T3: ZERO };
}

export function assetsByTier(bs: BalanceSheet): TierTotals {
  const pledged = pledgedHoldingIds(bs);
  const totals = emptyTiers();
  for (const h of bs.holdings) {
    const tier = effectiveTier(h, pledged);
    totals[tier] = totals[tier].plus(holdingValue(h));
  }
  return totals;
}

export interface LiquidityBreakdown {
  /** The four asset-side tiers (spec §6 items 1–4). */
  byTier: TierTotals;
  /** Spec §6 item 5. */
  borrowedFunds: Decimal;
  /** Spec §6 item 6 (derivatives margin, withdrawal queues, approvals, tax). */
  contingentObligations: Decimal;
  byScope: Record<AccountScope, { assets: Decimal; liabilities: Decimal; byTier: TierTotals }>;
}

export function liquidityBreakdown(bs: BalanceSheet): LiquidityBreakdown {
  const pledged = pledgedHoldingIds(bs);
  const scopeOf = new Map(bs.accounts.map((a) => [a.id, a.scope] as const));
  const byScope: LiquidityBreakdown['byScope'] = {
    observed: { assets: ZERO, liabilities: ZERO, byTier: emptyTiers() },
    managed: { assets: ZERO, liabilities: ZERO, byTier: emptyTiers() },
  };
  for (const h of bs.holdings) {
    const scope = scopeOf.get(h.accountId);
    if (!scope) throw new Error(`holding ${h.id} references unknown account ${h.accountId}`);
    const v = holdingValue(h);
    const tier = effectiveTier(h, pledged);
    byScope[scope].assets = byScope[scope].assets.plus(v);
    byScope[scope].byTier[tier] = byScope[scope].byTier[tier].plus(v);
  }
  for (const l of bs.liabilities) {
    const scope = scopeOf.get(l.accountId);
    if (!scope) throw new Error(`liability ${l.id} references unknown account ${l.accountId}`);
    byScope[scope].liabilities = byScope[scope].liabilities.plus(liabilityValue(l));
  }
  return {
    byTier: assetsByTier(bs),
    borrowedFunds: totalLiabilities(bs),
    contingentObligations: sum(bs.contingentObligations.map((c) => c.amount)),
    byScope,
  };
}

// ---------------------------------------------------------------------------------------------
// Collateral health
// ---------------------------------------------------------------------------------------------

export interface CollateralLeg {
  value: Decimal;
  ltv: Decimal;
  liquidationThreshold: Decimal;
}

/**
 * Health factor = Σ(collateral value × liquidation threshold) ÷ debt.
 * Returns null when there is no debt (HF is undefined/infinite).
 */
export function healthFactor(collateral: readonly CollateralLeg[], debt: Decimal): Decimal | null {
  if (debt.lte(0)) return null;
  const weighted = sum(collateral.map((c) => c.value.mul(c.liquidationThreshold)));
  return weighted.div(debt);
}

/**
 * Fractional fall in collateral value (relative to the debt's value) that brings HF to 1:
 * 1 − 1/HF. For a wstETH/ETH loop this is a drop in the wstETH/ETH ratio, not in ETH/USD.
 * Returns null when there is no debt; 0 when already liquidatable.
 */
export function liquidationDistance(hf: Decimal | null): Decimal | null {
  if (hf === null) return null;
  if (hf.lte(0)) return ZERO;
  return max0(ONE.minus(ONE.div(hf)));
}

export interface BorrowingCapacity {
  /** Σ(collateral value × LTV). */
  maxDebt: Decimal;
  currentDebt: Decimal;
  /** Additional borrowing allowed by the protocol right now (floored at zero). */
  available: Decimal;
  /** Current debt / collateral value. */
  currentLtv: Decimal | null;
}

export function borrowingCapacity(
  collateral: readonly CollateralLeg[],
  debt: Decimal,
): BorrowingCapacity {
  const maxDebt = sum(collateral.map((c) => c.value.mul(c.ltv)));
  const collateralValue = sum(collateral.map((c) => c.value));
  return {
    maxDebt,
    currentDebt: debt,
    available: max0(maxDebt.minus(debt)),
    currentLtv: collateralValue.gt(0) ? debt.div(collateralValue) : null,
  };
}

/** Additional debt that keeps HF ≥ targetHf: Σ(v×LT)/targetHf − debt, floored at 0. */
export function borrowableAtTargetHealthFactor(
  collateral: readonly CollateralLeg[],
  debt: Decimal,
  targetHf: Decimal,
): Decimal {
  if (targetHf.lte(0)) throw new RangeError('targetHf must be > 0');
  const weighted = sum(collateral.map((c) => c.value.mul(c.liquidationThreshold)));
  return max0(weighted.div(targetHf).minus(debt));
}

export interface PositionHealth {
  positionId: string;
  venue: string;
  network: string | undefined;
  collateralValue: Decimal;
  debt: Decimal;
  equity: Decimal;
  healthFactor: Decimal | null;
  liquidationDistance: Decimal | null;
  capacity: BorrowingCapacity;
  eMode: boolean;
}

export function evaluateCollateralPosition(
  bs: BalanceSheet,
  pos: CollateralPosition,
): PositionHealth {
  const holdingsById = new Map(bs.holdings.map((h) => [h.id, h] as const));
  const liabilitiesById = new Map(bs.liabilities.map((l) => [l.id, l] as const));
  const legs: CollateralLeg[] = pos.collateral.map((c) => {
    const h = holdingsById.get(c.holdingId);
    if (!h)
      throw new Error(`collateral position ${pos.id} references unknown holding ${c.holdingId}`);
    return {
      value: holdingValue(h),
      ltv: c.params.ltv,
      liquidationThreshold: c.params.liquidationThreshold,
    };
  });
  const debt = sum(
    pos.liabilityIds.map((id) => {
      const l = liabilitiesById.get(id);
      if (!l) throw new Error(`collateral position ${pos.id} references unknown liability ${id}`);
      return liabilityValue(l);
    }),
  );
  const collateralValue = sum(legs.map((l) => l.value));
  const hf = healthFactor(legs, debt);
  return {
    positionId: pos.id,
    venue: pos.venue,
    network: pos.network,
    collateralValue,
    debt,
    equity: collateralValue.minus(debt),
    healthFactor: hf,
    liquidationDistance: liquidationDistance(hf),
    capacity: borrowingCapacity(legs, debt),
    eMode: pos.collateral.some((c) => c.params.eMode),
  };
}

// ---------------------------------------------------------------------------------------------
// Consolidated report
// ---------------------------------------------------------------------------------------------

export interface BalanceSheetReport {
  asOf: string;
  currency: string;
  totalAssets: Decimal;
  totalLiabilities: Decimal;
  /** = NAV. */
  equity: Decimal;
  capital: CapitalSplit;
  liquidity: LiquidityBreakdown;
  positions: PositionHealth[];
  /** Sum of protocol-level available borrowing across positions. Not a recommendation to use it. */
  borrowingCapacity: Decimal;
  /** Worst (lowest) health factor across positions with debt, or null when nothing is borrowed. */
  worstHealthFactor: Decimal | null;
  /** T0 holdings in any scope. Reserve adequacy compares this to the required reserve. */
  reserveHeld: Decimal;
  reserveRequired: Decimal | null;
  reserveShortfall: Decimal | null;
}

export interface ReportOptions {
  reserveRequired?: Decimal;
  /** Count a fraction of T1 toward the reserve held (architecture §6.1 "partially, with haircut"). Default 0. */
  t1ReserveCredit?: Decimal;
}

export function balanceSheetReport(bs: BalanceSheet, opts: ReportOptions = {}): BalanceSheetReport {
  const capital = capitalSplit(bs);
  const liquidity = liquidityBreakdown(bs);
  const positions = bs.collateralPositions.map((p) => evaluateCollateralPosition(bs, p));
  const hfs = positions.map((p) => p.healthFactor).filter((x): x is Decimal => x !== null);
  const worst = hfs.length ? hfs.reduce((a, b) => (a.lte(b) ? a : b)) : null;
  const t1Credit = opts.t1ReserveCredit ?? ZERO;
  const reserveHeld = liquidity.byTier.T0.plus(liquidity.byTier.T1.mul(t1Credit));
  const reserveRequired = opts.reserveRequired ?? null;
  return {
    asOf: bs.asOf,
    currency: bs.currency,
    totalAssets: capital.grossAssets,
    totalLiabilities: capital.borrowedCapital,
    equity: capital.ownerCapital,
    capital,
    liquidity,
    positions,
    borrowingCapacity: sum(positions.map((p) => p.capacity.available)),
    worstHealthFactor: worst,
    reserveHeld,
    reserveRequired,
    reserveShortfall: reserveRequired ? max0(reserveRequired.minus(reserveHeld)) : null,
  };
}

export { LIQUIDITY_TIERS, d as decimal };
