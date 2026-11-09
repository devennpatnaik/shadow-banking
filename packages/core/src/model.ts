import type { Decimal } from './money.js';
import type { AssetClass } from './disclosure.js';

/**
 * Domain model for the consolidated balance sheet. Names follow docs/architecture.md §6:
 * Account (scope observed|managed), Asset, Holding, Liability, CollateralPosition,
 * ContingentObligation, BalanceSheet, liquidity tiers T0..T3.
 */

export type AccountKind = 'bank' | 'brokerage' | 'wallet' | 'lending' | 'venue' | 'other';
export type Custody = 'external' | 'self_custody_user' | 'platform_hot';
/** observed = we can read it; managed = we are authorized and technically able to act on it. */
export type AccountScope = 'observed' | 'managed';

export interface Account {
  id: string;
  kind: AccountKind;
  institution: string;
  network?: string;
  custody: Custody;
  scope: AccountScope;
  /** ISO timestamp of the last successful read. */
  freshness?: string;
}

/**
 * Liquidity tiers (spec §6, architecture §6.1).
 * T0 immediately withdrawable · T1 liquid under normal conditions · T2 delayed / unbonding ·
 * T3 locked or committed as collateral/margin. Borrowed funds and contingent obligations are
 * the two remaining spec categories; they live on the liability side (see liquidityBreakdown).
 */
export type LiquidityTier = 'T0' | 'T1' | 'T2' | 'T3';
export const LIQUIDITY_TIERS: readonly LiquidityTier[] = ['T0', 'T1', 'T2', 'T3'];
export const LIQUIDITY_TIER_LABELS: Record<LiquidityTier, string> = {
  T0: 'Immediately withdrawable',
  T1: 'Liquid under normal conditions',
  T2: 'Delayed / unbonding',
  T3: 'Locked or committed collateral',
};

export interface Asset {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  network?: string;
  /** Intrinsic tier when unpledged. T3 is derived from being pledged in a CollateralPosition. */
  liquidityTier: Exclude<LiquidityTier, 'T3'>;
  isStable: boolean;
  isYieldBearing: boolean;
  /** Estimated recurring yield, decimal per year. An estimate, never a realized figure. */
  yieldApy?: Decimal;
  redemptionDelayDays?: number;
}

export interface Holding {
  id: string;
  accountId: string;
  asset: Asset;
  quantity: Decimal;
  /** Fair value per unit in the balance sheet's reporting currency. */
  priceMark: Decimal;
  priceSource?: string;
}

export type RateType = 'variable' | 'fixed';

export interface Liability {
  id: string;
  accountId: string;
  symbol: string;
  principal: Decimal;
  accruedInterest: Decimal;
  /** Price per unit of the borrowed asset in the reporting currency. */
  priceMark: Decimal;
  rateType: RateType;
  /** Current annual rate as a decimal fraction (0.02 = 2%). */
  currentApr: Decimal;
  venue?: string;
}

export interface CollateralParams {
  /** Max borrow as a fraction of collateral value. */
  ltv: Decimal;
  /** HF = 1 when debt reaches collateral value × liquidationThreshold. */
  liquidationThreshold: Decimal;
  /** Penalty paid to liquidators as a fraction of liquidated debt. */
  liquidationBonus: Decimal;
  eMode: boolean;
  eModeCategory?: string;
}

export interface PledgedHolding {
  holdingId: string;
  params: CollateralParams;
}

/** One lending-market account: a set of pledged holdings securing a set of liabilities. */
export interface CollateralPosition {
  id: string;
  accountId: string;
  venue: string;
  network?: string;
  collateral: PledgedHolding[];
  liabilityIds: string[];
}

export type ContingentKind = 'margin' | 'withdrawal_queue' | 'approval' | 'tax' | 'other';

export interface ContingentObligation {
  id: string;
  accountId?: string;
  kind: ContingentKind;
  amount: Decimal;
  dueOrTrigger?: string;
}

export interface BalanceSheet {
  asOf: string;
  currency: string;
  accounts: Account[];
  holdings: Holding[];
  liabilities: Liability[];
  collateralPositions: CollateralPosition[];
  contingentObligations: ContingentObligation[];
}
