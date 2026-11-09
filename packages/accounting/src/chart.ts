export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export type AccountId =
  | 'cash'
  | 'productive_assets'
  | 'collateral_assets'
  | 'lending_assets'
  | 'other_assets'
  | 'borrow_principal'
  | 'accrued_interest'
  | 'contributed_capital'
  | 'withdrawals'
  | 'unrealized_pnl'
  | 'staking_income'
  | 'lending_income'
  | 'funding_income'
  | 'lp_income'
  | 'incentives'
  | 'realized_pnl'
  | 'fees'
  | 'financing_cost'
  | 'funding_expense'
  | 'liquidation_loss'
  | 'other_loss'
  | 'operating_expense';

export interface ChartAccount {
  id: AccountId;
  name: string;
  type: AccountType;
  /** Debit-normal accounts (assets, expenses, contra-equity withdrawals). */
  debitNormal: boolean;
}

export const CHART: Record<AccountId, ChartAccount> = {
  cash: { id: 'cash', name: 'Cash and equivalents', type: 'asset', debitNormal: true },
  productive_assets: {
    id: 'productive_assets',
    name: 'Productive assets',
    type: 'asset',
    debitNormal: true,
  },
  collateral_assets: {
    id: 'collateral_assets',
    name: 'Collateral',
    type: 'asset',
    debitNormal: true,
  },
  lending_assets: {
    id: 'lending_assets',
    name: 'Lending deposits',
    type: 'asset',
    debitNormal: true,
  },
  other_assets: { id: 'other_assets', name: 'Other assets', type: 'asset', debitNormal: true },
  borrow_principal: {
    id: 'borrow_principal',
    name: 'Borrow principal',
    type: 'liability',
    debitNormal: false,
  },
  accrued_interest: {
    id: 'accrued_interest',
    name: 'Accrued interest payable',
    type: 'liability',
    debitNormal: false,
  },
  contributed_capital: {
    id: 'contributed_capital',
    name: 'Contributed capital (seed + deposits)',
    type: 'equity',
    debitNormal: false,
  },
  withdrawals: {
    id: 'withdrawals',
    name: 'Withdrawals (contra-equity)',
    type: 'equity',
    debitNormal: true,
  },
  unrealized_pnl: {
    id: 'unrealized_pnl',
    name: 'Unrealized P&L',
    type: 'equity',
    debitNormal: false,
  },
  staking_income: {
    id: 'staking_income',
    name: 'Staking rewards',
    type: 'income',
    debitNormal: false,
  },
  lending_income: {
    id: 'lending_income',
    name: 'Lending income',
    type: 'income',
    debitNormal: false,
  },
  funding_income: {
    id: 'funding_income',
    name: 'Funding payments received',
    type: 'income',
    debitNormal: false,
  },
  lp_income: { id: 'lp_income', name: 'LP income', type: 'income', debitNormal: false },
  incentives: { id: 'incentives', name: 'Incentives', type: 'income', debitNormal: false },
  realized_pnl: { id: 'realized_pnl', name: 'Realized P&L', type: 'income', debitNormal: false },
  fees: { id: 'fees', name: 'Trading and transaction fees', type: 'expense', debitNormal: true },
  financing_cost: {
    id: 'financing_cost',
    name: 'Financing costs',
    type: 'expense',
    debitNormal: true,
  },
  funding_expense: {
    id: 'funding_expense',
    name: 'Funding payments paid',
    type: 'expense',
    debitNormal: true,
  },
  liquidation_loss: {
    id: 'liquidation_loss',
    name: 'Liquidation losses',
    type: 'expense',
    debitNormal: true,
  },
  other_loss: { id: 'other_loss', name: 'Other losses', type: 'expense', debitNormal: true },
  operating_expense: {
    id: 'operating_expense',
    name: 'Operating / upcoming expenses funded',
    type: 'expense',
    debitNormal: true,
  },
};

export const ACCOUNT_IDS = Object.keys(CHART) as AccountId[];

export const ASSET_ACCOUNTS: AccountId[] = ACCOUNT_IDS.filter((id) => CHART[id].type === 'asset');
export const LIABILITY_ACCOUNTS: AccountId[] = ACCOUNT_IDS.filter(
  (id) => CHART[id].type === 'liability',
);
export const INCOME_ACCOUNTS: AccountId[] = ACCOUNT_IDS.filter((id) => CHART[id].type === 'income');
export const EXPENSE_ACCOUNTS: AccountId[] = ACCOUNT_IDS.filter(
  (id) => CHART[id].type === 'expense',
);

export function isPnlAccount(id: AccountId): boolean {
  const t = CHART[id].type;
  return t === 'income' || t === 'expense' || id === 'unrealized_pnl';
}
