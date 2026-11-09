import { d, ZERO, type Decimal } from '@shadow-banking/core';
import { CHART, INCOME_ACCOUNTS, isPnlAccount, type AccountId } from './chart.js';
import type { EconomicKind, EntryCategory, JournalEntry, JournalLine } from './types.js';

const FINANCING_KINDS: ReadonlySet<EconomicKind> = new Set(['borrow', 'repay', 'accrue_interest']);
const EQUITY_FLOW_KINDS: ReadonlySet<EconomicKind> = new Set(['seed', 'deposit', 'withdrawal']);
const TRANSFER_KINDS: ReadonlySet<EconomicKind> = new Set([
  'transfer',
  'pledge',
  'unpledge',
  'supply_lending',
  'withdraw_lending',
]);

export function lineAmount(line: JournalLine): Decimal {
  return line.amount;
}

export function debitTotal(lines: readonly JournalLine[]): Decimal {
  return lines.reduce((s, l) => (l.side === 'debit' ? s.plus(l.amount) : s), ZERO);
}

export function creditTotal(lines: readonly JournalLine[]): Decimal {
  return lines.reduce((s, l) => (l.side === 'credit' ? s.plus(l.amount) : s), ZERO);
}

export function assertBalanced(lines: readonly JournalLine[], label: string): void {
  if (lines.length < 2) throw new RangeError(`${label}: double-entry requires at least two lines`);
  for (const line of lines) {
    if (!CHART[line.account]) throw new RangeError(`${label}: unknown account ${line.account}`);
    if (!line.amount.isFinite() || line.amount.lte(0)) {
      throw new RangeError(`${label}: line amounts must be positive finite numbers`);
    }
  }
  const dr = debitTotal(lines);
  const cr = creditTotal(lines);
  if (!dr.eq(cr)) {
    throw new RangeError(
      `${label}: unbalanced entry (debits ${dr.toString()} ≠ credits ${cr.toString()})`,
    );
  }
}

function accountsOf(lines: readonly JournalLine[]): Set<AccountId> {
  return new Set(lines.map((l) => l.account));
}

/** Borrowed principal and inter-account transfers must never hit P&L. */
export function assertEconomicRules(
  entry: Pick<JournalEntry, 'kind' | 'category' | 'lines'>,
): void {
  const ids = accountsOf(entry.lines);
  const hitsIncome = [...ids].some((id) => INCOME_ACCOUNTS.includes(id));
  const hitsPnl = [...ids].some((id) => isPnlAccount(id));

  if (FINANCING_KINDS.has(entry.kind)) {
    if (entry.kind === 'borrow' || entry.kind === 'repay') {
      if (hitsPnl) {
        throw new RangeError(
          `${entry.kind} cannot post to income, expense, or unrealized P&L (borrowed principal is not income)`,
        );
      }
      if (entry.category !== 'financing') {
        throw new RangeError(`${entry.kind} must use category "financing"`);
      }
    }
    if (entry.kind === 'accrue_interest' && hitsIncome) {
      throw new RangeError('interest accrual cannot credit income accounts');
    }
  }

  if (TRANSFER_KINDS.has(entry.kind)) {
    if (hitsPnl) {
      throw new RangeError(
        `${entry.kind} cannot post to P&L (inter-account transfers and reclasses are not profit)`,
      );
    }
    if (entry.category !== 'transfer') {
      throw new RangeError(`${entry.kind} must use category "transfer"`);
    }
  }

  if (EQUITY_FLOW_KINDS.has(entry.kind)) {
    if (hitsPnl) {
      throw new RangeError(
        `${entry.kind} cannot post to P&L (deposits/withdrawals are equity, not income)`,
      );
    }
    if (entry.category !== 'equity') {
      throw new RangeError(`${entry.kind} must use category "equity"`);
    }
  }

  if (entry.kind === 'mark' && entry.category !== 'valuation') {
    throw new RangeError('mark-to-market must use category "valuation"');
  }
}

export function signedRaw(lines: readonly JournalLine[], account: AccountId): Decimal {
  return lines.reduce((s, l) => {
    if (l.account !== account) return s;
    return l.side === 'debit' ? s.plus(l.amount) : s.minus(l.amount);
  }, d(0));
}

export function expectedCategory(kind: EconomicKind): EntryCategory {
  switch (kind) {
    case 'seed':
    case 'deposit':
    case 'withdrawal':
      return 'equity';
    case 'transfer':
    case 'pledge':
    case 'unpledge':
    case 'supply_lending':
    case 'withdraw_lending':
    case 'acquire_asset':
      return 'transfer';
    case 'dispose_asset':
      return 'income';
    case 'borrow':
    case 'repay':
      return 'financing';
    case 'mark':
      return 'valuation';
    case 'staking':
    case 'lending':
    case 'funding':
    case 'lp':
    case 'incentive':
    case 'realized_pnl':
      return 'income';
    case 'accrue_interest':
    case 'fee':
    case 'liquidation':
    case 'other_loss':
    case 'operating_expense':
      return 'expense';
  }
}
