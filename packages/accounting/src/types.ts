import type { Account, AssetClass, CollateralParams, LiquidityTier } from '@shadow-banking/core';
import type { Decimal } from '@shadow-banking/core';
import type { AccountId } from './chart.js';

export type EntryCategory =
  'income' | 'expense' | 'transfer' | 'equity' | 'valuation' | 'financing';

/**
 * Economic event. Borrowing and inter-account transfers are first-class kinds so they can
 * never be posted to income (spec §8).
 */
export type EconomicKind =
  | 'seed'
  | 'deposit'
  | 'withdrawal'
  | 'transfer'
  | 'acquire_asset'
  | 'dispose_asset'
  | 'pledge'
  | 'unpledge'
  | 'supply_lending'
  | 'withdraw_lending'
  | 'borrow'
  | 'repay'
  | 'accrue_interest'
  | 'staking'
  | 'lending'
  | 'funding'
  | 'lp'
  | 'incentive'
  | 'fee'
  | 'mark'
  | 'realized_pnl'
  | 'liquidation'
  | 'other_loss'
  | 'operating_expense';

export type HoldingRole = 'cash' | 'reserve' | 'productive' | 'collateral' | 'lending' | 'other';

export type Side = 'debit' | 'credit';

export interface InstrumentDef {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  network?: string;
  liquidityTier: Exclude<LiquidityTier, 'T3'>;
  isStable: boolean;
  isYieldBearing: boolean;
  collateralParams?: CollateralParams;
}

export interface JournalLine {
  account: AccountId;
  side: Side;
  /** Reporting-currency amount; always > 0. */
  amount: Decimal;
  quantity?: Decimal;
  instrumentId?: string;
  venueAccountId?: string;
  holdingId?: string;
  memo?: string;
}

export interface JournalEntry {
  id: string;
  at: string;
  category: EntryCategory;
  kind: EconomicKind;
  source: string;
  memo: string;
  lines: JournalLine[];
  priceMark?: Decimal;
  instrumentId?: string;
  intentHash?: string;
}

export interface HoldingLot {
  id: string;
  venueAccountId: string;
  instrumentId: string;
  quantity: Decimal;
  costBasisUsd: Decimal;
  role: HoldingRole;
  collateralPositionId?: string;
}

export interface BorrowLot {
  id: string;
  venueAccountId: string;
  instrumentId: string;
  principal: Decimal;
  accruedInterest: Decimal;
  apr: Decimal;
  priceMark: Decimal;
  venue?: string;
}

export interface NavSnapshot {
  at: string;
  entryId: string;
  nav: Decimal;
  shares: Decimal;
  unitNav: Decimal;
  grossAssets: Decimal;
  totalDebt: Decimal;
  deployed: Decimal;
  liquidReserves: Decimal;
  netPnl: Decimal;
  realizedPnl: Decimal;
  unrealizedPnl: Decimal;
}

export type RiskStateName = 'Normal' | 'Caution' | 'Deleveraging' | 'Emergency';

export type AllocationUse =
  'repay_debt' | 'add_collateral' | 'buy_yield_assets' | 'raise_reserves' | 'fund_expenses';

export interface LedgerMeta {
  currency: string;
  createdAt: string;
  label: string;
  accounts: Account[];
  instruments: Record<string, InstrumentDef>;
  defaultHurdleApy: Decimal;
}
