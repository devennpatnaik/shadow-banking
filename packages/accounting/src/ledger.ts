import {
  DAYS_PER_YEAR,
  ONE,
  ZERO,
  d,
  evaluateCollateralPosition,
  type Account,
  type BalanceSheet,
  type Decimal,
  type Holding as BsHolding,
  type Liability as BsLiability,
} from '@shadow-banking/core';
import {
  ACCOUNT_IDS,
  ASSET_ACCOUNTS,
  CHART,
  EXPENSE_ACCOUNTS,
  INCOME_ACCOUNTS,
  LIABILITY_ACCOUNTS,
  type AccountId,
} from './chart.js';
import type {
  BorrowLot,
  EconomicKind,
  HoldingLot,
  HoldingRole,
  InstrumentDef,
  JournalEntry,
  JournalLine,
  LedgerMeta,
  NavSnapshot,
} from './types.js';
import { assertBalanced, assertEconomicRules, expectedCategory } from './validate.js';

export interface NewEntry {
  at: string;
  kind: EconomicKind;
  source?: string;
  memo: string;
  lines: JournalLine[];
  priceMark?: Decimal;
  instrumentId?: string;
  intentHash?: string;
}

export interface LedgerState {
  meta: LedgerMeta;
  entries: JournalEntry[];
  holdings: HoldingLot[];
  borrows: BorrowLot[];
  priceMarks: Record<string, Decimal>;
  raw: Record<AccountId, Decimal>;
  shares: Decimal;
  snapshots: NavSnapshot[];
}

const GL_FOR_ROLE: Record<HoldingRole, AccountId> = {
  cash: 'cash',
  reserve: 'cash',
  productive: 'productive_assets',
  collateral: 'collateral_assets',
  lending: 'lending_assets',
  other: 'other_assets',
};

function maxNumericSuffix(ids: readonly string[], prefix: string): number {
  let m = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isFinite(n) && n > m) m = n;
  }
  return m;
}

function emptyRaw(): Record<AccountId, Decimal> {
  return Object.fromEntries(ACCOUNT_IDS.map((id) => [id, ZERO])) as Record<AccountId, Decimal>;
}

function signedBalance(rawDc: Decimal, id: AccountId): Decimal {
  return CHART[id].debitNormal ? rawDc : rawDc.neg();
}

export class Ledger {
  readonly meta: LedgerMeta;
  private entries: JournalEntry[] = [];
  private holdings: HoldingLot[] = [];
  private borrows: BorrowLot[] = [];
  private priceMarks: Record<string, Decimal> = {};
  private raw: Record<AccountId, Decimal> = emptyRaw();
  private shares = ZERO;
  private snapshots: NavSnapshot[] = [];
  private seq = 0;
  private lotSeq = 0;
  private seenIntents = new Map<string, string>();

  constructor(meta: LedgerMeta) {
    this.meta = meta;
    for (const inst of Object.values(meta.instruments)) {
      if (inst.isStable) this.priceMarks[inst.id] = d(1);
    }
  }

  static fromState(state: LedgerState): Ledger {
    const l = new Ledger(state.meta);
    l.entries = state.entries.map((e) => ({ ...e, lines: e.lines.map((ln) => ({ ...ln })) }));
    l.holdings = state.holdings.map((h) => ({ ...h }));
    l.borrows = state.borrows.map((b) => ({ ...b }));
    l.priceMarks = { ...state.priceMarks };
    l.raw = { ...state.raw };
    l.shares = state.shares;
    l.snapshots = state.snapshots.map((s) => ({ ...s }));
    l.seq = maxNumericSuffix(
      state.entries.map((e) => e.id),
      'e-',
    );
    l.lotSeq = Math.max(
      maxNumericSuffix(
        state.holdings.map((h) => h.id),
        'h-',
      ),
      maxNumericSuffix(
        state.borrows.map((b) => b.id),
        'b-',
      ),
    );
    for (const e of state.entries) {
      if (e.intentHash) l.seenIntents.set(e.intentHash, e.id);
    }
    return l;
  }

  toState(): LedgerState {
    return {
      meta: this.meta,
      entries: this.entries.map((e) => ({ ...e, lines: e.lines.map((ln) => ({ ...ln })) })),
      holdings: this.holdings.map((h) => ({ ...h })),
      borrows: this.borrows.map((b) => ({ ...b })),
      priceMarks: { ...this.priceMarks },
      raw: { ...this.raw },
      shares: this.shares,
      snapshots: this.snapshots.map((s) => ({ ...s })),
    };
  }

  getEntries(): readonly JournalEntry[] {
    return this.entries;
  }

  getHoldings(): readonly HoldingLot[] {
    return this.holdings;
  }

  getBorrows(): readonly BorrowLot[] {
    return this.borrows;
  }

  getSnapshots(): readonly NavSnapshot[] {
    return this.snapshots;
  }

  getShares(): Decimal {
    return this.shares;
  }

  instrument(id: string): InstrumentDef {
    const inst = this.meta.instruments[id];
    if (!inst) throw new Error(`unknown instrument ${id}`);
    return inst;
  }

  priceOf(instrumentId: string): Decimal {
    const p = this.priceMarks[instrumentId];
    if (!p) throw new Error(`no price mark for ${instrumentId}`);
    return p;
  }

  balance(id: AccountId): Decimal {
    return signedBalance(this.raw[id] ?? ZERO, id);
  }

  grossAssets(): Decimal {
    return ASSET_ACCOUNTS.reduce((s, id) => s.plus(this.balance(id)), ZERO);
  }

  totalDebt(): Decimal {
    return LIABILITY_ACCOUNTS.reduce((s, id) => s.plus(this.balance(id)), ZERO);
  }

  /** NAV = fair value of assets − liabilities (spec §8). */
  nav(): Decimal {
    return this.grossAssets().minus(this.totalDebt());
  }

  unitNav(): Decimal {
    return this.shares.gt(0) ? this.nav().div(this.shares) : ONE;
  }

  contributedCapital(): Decimal {
    return this.balance('contributed_capital');
  }

  withdrawals(): Decimal {
    return this.balance('withdrawals');
  }

  netContributed(): Decimal {
    return this.contributedCapital().minus(this.withdrawals());
  }

  initialEquity(): Decimal {
    const first = this.entries.find((e) => e.kind === 'seed');
    if (!first) return this.contributedCapital();
    return first.lines
      .filter((l) => l.account === 'contributed_capital' && l.side === 'credit')
      .reduce((s, l) => s.plus(l.amount), ZERO);
  }

  depositsAfterSeed(): Decimal {
    return this.contributedCapital().minus(this.initialEquity());
  }

  incomeTotal(): Decimal {
    return INCOME_ACCOUNTS.reduce((s, id) => s.plus(this.balance(id)), ZERO);
  }

  expenseTotal(): Decimal {
    return EXPENSE_ACCOUNTS.reduce((s, id) => s.plus(this.balance(id)), ZERO);
  }

  realizedPnl(): Decimal {
    return this.incomeTotal().minus(this.expenseTotal());
  }

  unrealizedPnl(): Decimal {
    return this.balance('unrealized_pnl');
  }

  /** Dollar P&L excluding deposits, withdrawals, and borrowed principal. */
  netPnl(): Decimal {
    return this.nav().minus(this.netContributed());
  }

  financingCosts(): Decimal {
    return this.balance('financing_cost').plus(this.balance('funding_expense'));
  }

  deployedCapital(): Decimal {
    return this.balance('productive_assets')
      .plus(this.balance('collateral_assets'))
      .plus(this.balance('lending_assets'));
  }

  liquidReserves(): Decimal {
    return this.holdings
      .filter((h) => h.role === 'cash' || h.role === 'reserve')
      .reduce((s, h) => s.plus(h.quantity.mul(this.priceOf(h.instrumentId))), ZERO);
  }

  periodDays(): number {
    const a = this.entries[0];
    const b = this.entries[this.entries.length - 1];
    if (!a || !b) return 0;
    return Math.max(0, (Date.parse(b.at) - Date.parse(a.at)) / 86_400_000);
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${String(this.seq).padStart(4, '0')}`;
  }

  private nextLot(prefix: string): string {
    this.lotSeq += 1;
    return `${prefix}-${String(this.lotSeq).padStart(4, '0')}`;
  }

  private requireAccount(id: string): Account {
    const a = this.meta.accounts.find((x) => x.id === id);
    if (!a) throw new Error(`unknown venue account ${id}`);
    return a;
  }

  private holding(id: string): HoldingLot {
    const h = this.holdings.find((x) => x.id === id);
    if (!h) throw new Error(`unknown holding ${id}`);
    return h;
  }

  post(entry: NewEntry): JournalEntry {
    if (entry.intentHash) {
      const existing = this.seenIntents.get(entry.intentHash);
      if (existing) {
        const found = this.entries.find((e) => e.id === existing);
        if (found) return found;
      }
    }
    const category = expectedCategory(entry.kind);
    const full: JournalEntry = {
      id: this.nextId('e'),
      at: entry.at,
      category,
      kind: entry.kind,
      source: entry.source ?? 'manual',
      memo: entry.memo,
      lines: entry.lines.map((l) => ({ ...l })),
      ...(entry.priceMark ? { priceMark: entry.priceMark } : {}),
      ...(entry.instrumentId ? { instrumentId: entry.instrumentId } : {}),
      ...(entry.intentHash ? { intentHash: entry.intentHash } : {}),
    };
    assertBalanced(full.lines, full.id);
    assertEconomicRules(full);
    if (entry.kind === 'dispose_asset') {
      full.category = full.lines.some((l) => l.account === 'realized_pnl') ? 'income' : 'transfer';
    }
    for (const line of full.lines) {
      const delta = line.side === 'debit' ? line.amount : line.amount.neg();
      this.raw[line.account] = (this.raw[line.account] ?? ZERO).plus(delta);
    }
    this.entries.push(full);
    if (full.intentHash) this.seenIntents.set(full.intentHash, full.id);
    this.pushSnapshot(full);
    return full;
  }

  private pushSnapshot(entry: JournalEntry): void {
    const nav = this.nav();
    const shares = this.shares.gt(0) ? this.shares : nav.gt(0) ? nav : ONE;
    this.snapshots.push({
      at: entry.at,
      entryId: entry.id,
      nav,
      shares,
      unitNav: nav.div(shares),
      grossAssets: this.grossAssets(),
      totalDebt: this.totalDebt(),
      deployed: this.deployedCapital(),
      liquidReserves: this.liquidReserves(),
      netPnl: this.netPnl(),
      realizedPnl: this.realizedPnl(),
      unrealizedPnl: this.unrealizedPnl(),
    });
  }

  private addCash(
    venueAccountId: string,
    instrumentId: string,
    qty: Decimal,
    role: HoldingRole,
  ): string {
    const existing = this.holdings.find(
      (h) =>
        h.venueAccountId === venueAccountId && h.instrumentId === instrumentId && h.role === role,
    );
    const px = this.priceOf(instrumentId);
    if (existing) {
      existing.quantity = existing.quantity.plus(qty);
      existing.costBasisUsd = existing.costBasisUsd.plus(qty.mul(px));
      return existing.id;
    }
    const id = this.nextLot('h');
    this.holdings.push({
      id,
      venueAccountId,
      instrumentId,
      quantity: qty,
      costBasisUsd: qty.mul(px),
      role,
    });
    return id;
  }

  private reduceHolding(id: string, qty: Decimal): { releasedCost: Decimal; holding: HoldingLot } {
    const h = this.holding(id);
    if (qty.gt(h.quantity))
      throw new RangeError(`holding ${id} has ${h.quantity.toString()}, need ${qty.toString()}`);
    const releasedCost = h.quantity.eq(0) ? ZERO : h.costBasisUsd.mul(qty).div(h.quantity);
    h.quantity = h.quantity.minus(qty);
    h.costBasisUsd = h.costBasisUsd.minus(releasedCost);
    if (h.quantity.eq(0)) {
      this.holdings = this.holdings.filter((x) => x.id !== h.id);
    }
    return { releasedCost, holding: h };
  }

  seed(args: {
    at: string;
    amount: Decimal;
    venueAccountId: string;
    instrumentId?: string;
    source?: string;
  }): JournalEntry {
    const instrumentId = args.instrumentId ?? 'USD';
    this.requireAccount(args.venueAccountId);
    if (!this.priceMarks[instrumentId]) this.priceMarks[instrumentId] = d(1);
    this.addCash(args.venueAccountId, instrumentId, args.amount, 'cash');
    if (this.shares.eq(0)) this.shares = args.amount;
    else this.shares = this.shares.plus(args.amount.div(this.unitNav()));
    return this.post({
      at: args.at,
      kind: 'seed',
      source: args.source ?? 'user',
      memo: `Seed equity ${args.amount.toString()}`,
      lines: [
        {
          account: 'cash',
          side: 'debit',
          amount: args.amount,
          quantity: args.amount,
          instrumentId,
          venueAccountId: args.venueAccountId,
        },
        { account: 'contributed_capital', side: 'credit', amount: args.amount },
      ],
    });
  }

  deposit(args: {
    at: string;
    amount: Decimal;
    venueAccountId: string;
    instrumentId?: string;
    source?: string;
  }): JournalEntry {
    const instrumentId = args.instrumentId ?? 'USD';
    this.requireAccount(args.venueAccountId);
    const unit = this.unitNav();
    this.addCash(args.venueAccountId, instrumentId, args.amount, 'cash');
    this.shares = this.shares.plus(args.amount.div(unit));
    return this.post({
      at: args.at,
      kind: 'deposit',
      source: args.source ?? 'user',
      memo: `Deposit ${args.amount.toString()}`,
      lines: [
        {
          account: 'cash',
          side: 'debit',
          amount: args.amount,
          quantity: args.amount,
          instrumentId,
          venueAccountId: args.venueAccountId,
        },
        { account: 'contributed_capital', side: 'credit', amount: args.amount },
      ],
    });
  }

  withdraw(args: {
    at: string;
    amount: Decimal;
    holdingId: string;
    source?: string;
  }): JournalEntry {
    const { holding } = this.reduceHolding(args.holdingId, args.amount);
    const unit = this.unitNav();
    if (unit.lte(0)) throw new RangeError('cannot withdraw at non-positive unit NAV');
    this.shares = this.shares.minus(args.amount.div(unit));
    return this.post({
      at: args.at,
      kind: 'withdrawal',
      source: args.source ?? 'user',
      memo: `Withdrawal ${args.amount.toString()}`,
      lines: [
        { account: 'withdrawals', side: 'debit', amount: args.amount },
        {
          account: 'cash',
          side: 'credit',
          amount: args.amount,
          quantity: args.amount,
          instrumentId: holding.instrumentId,
          venueAccountId: holding.venueAccountId,
          holdingId: args.holdingId,
        },
      ],
    });
  }

  /** Move cash between venue accounts / reserve vs working. Never P&L. */
  transferCash(args: {
    at: string;
    amount: Decimal;
    fromHoldingId: string;
    toVenueAccountId: string;
    toRole: HoldingRole;
    memo?: string;
  }): JournalEntry {
    const { holding } = this.reduceHolding(args.fromHoldingId, args.amount);
    this.requireAccount(args.toVenueAccountId);
    const toId = this.addCash(
      args.toVenueAccountId,
      holding.instrumentId,
      args.amount,
      args.toRole,
    );
    const fromGl = GL_FOR_ROLE[holding.role];
    const toGl = GL_FOR_ROLE[args.toRole];
    return this.post({
      at: args.at,
      kind: 'transfer',
      memo: args.memo ?? `Transfer ${args.amount.toString()} ${holding.instrumentId}`,
      lines: [
        {
          account: toGl,
          side: 'debit',
          amount: args.amount,
          quantity: args.amount,
          instrumentId: holding.instrumentId,
          venueAccountId: args.toVenueAccountId,
          holdingId: toId,
        },
        {
          account: fromGl,
          side: 'credit',
          amount: args.amount,
          quantity: args.amount,
          instrumentId: holding.instrumentId,
          venueAccountId: holding.venueAccountId,
          holdingId: args.fromHoldingId,
        },
      ],
    });
  }

  acquire(args: {
    at: string;
    instrumentId: string;
    quantity: Decimal;
    price: Decimal;
    cashHoldingId: string;
    venueAccountId: string;
    role?: HoldingRole;
    fee?: Decimal;
    feeHoldingId?: string;
    source?: string;
  }): { asset: JournalEntry; fee: JournalEntry | null; holdingId: string } {
    this.instrument(args.instrumentId);
    this.priceMarks[args.instrumentId] = args.price;
    const cost = args.quantity.mul(args.price);
    const role = args.role ?? 'productive';
    const { holding: cash } = this.reduceHolding(args.cashHoldingId, cost);
    const holdingId = this.nextLot('h');
    this.holdings.push({
      id: holdingId,
      venueAccountId: args.venueAccountId,
      instrumentId: args.instrumentId,
      quantity: args.quantity,
      costBasisUsd: cost,
      role,
    });
    const asset = this.post({
      at: args.at,
      kind: 'acquire_asset',
      source: args.source ?? 'execution',
      memo: `Acquire ${args.quantity.toString()} ${args.instrumentId} @ ${args.price.toString()}`,
      instrumentId: args.instrumentId,
      priceMark: args.price,
      lines: [
        {
          account: GL_FOR_ROLE[role],
          side: 'debit',
          amount: cost,
          quantity: args.quantity,
          instrumentId: args.instrumentId,
          venueAccountId: args.venueAccountId,
          holdingId,
        },
        {
          account: GL_FOR_ROLE[cash.role],
          side: 'credit',
          amount: cost,
          quantity: cost,
          instrumentId: cash.instrumentId,
          venueAccountId: cash.venueAccountId,
          holdingId: args.cashHoldingId,
        },
      ],
    });
    let fee: JournalEntry | null = null;
    if (args.fee && args.fee.gt(0)) {
      const feeHold = args.feeHoldingId ?? args.cashHoldingId;
      fee = this.chargeFee({
        at: args.at,
        amount: args.fee,
        holdingId: feeHold,
        memo: `Entry fee for ${args.instrumentId}`,
      });
    }
    return { asset, fee, holdingId };
  }

  pledge(args: {
    at: string;
    holdingId: string;
    collateralPositionId: string;
    memo?: string;
  }): JournalEntry {
    const h = this.holding(args.holdingId);
    if (h.role === 'collateral') throw new RangeError(`holding ${h.id} is already collateral`);
    const fv = h.quantity.mul(this.priceOf(h.instrumentId));
    const from = GL_FOR_ROLE[h.role];
    h.role = 'collateral';
    h.collateralPositionId = args.collateralPositionId;
    return this.post({
      at: args.at,
      kind: 'pledge',
      memo: args.memo ?? `Pledge ${h.instrumentId} as collateral`,
      instrumentId: h.instrumentId,
      lines: [
        {
          account: 'collateral_assets',
          side: 'debit',
          amount: fv,
          quantity: h.quantity,
          instrumentId: h.instrumentId,
          holdingId: h.id,
        },
        {
          account: from,
          side: 'credit',
          amount: fv,
          quantity: h.quantity,
          instrumentId: h.instrumentId,
          holdingId: h.id,
        },
      ],
    });
  }

  supplyLending(args: { at: string; holdingId: string; memo?: string }): JournalEntry {
    const h = this.holding(args.holdingId);
    const fv = h.quantity.mul(this.priceOf(h.instrumentId));
    const from = GL_FOR_ROLE[h.role];
    h.role = 'lending';
    return this.post({
      at: args.at,
      kind: 'supply_lending',
      memo: args.memo ?? `Supply ${h.instrumentId} to lending market`,
      lines: [
        {
          account: 'lending_assets',
          side: 'debit',
          amount: fv,
          quantity: h.quantity,
          instrumentId: h.instrumentId,
          holdingId: h.id,
        },
        {
          account: from,
          side: 'credit',
          amount: fv,
          quantity: h.quantity,
          instrumentId: h.instrumentId,
          holdingId: h.id,
        },
      ],
    });
  }

  borrow(args: {
    at: string;
    amount: Decimal;
    instrumentId: string;
    venueAccountId: string;
    cashVenueAccountId: string;
    cashRole?: HoldingRole;
    apr: Decimal;
    venue?: string;
    intentHash?: string;
  }): { entry: JournalEntry; borrowId: string; cashHoldingId: string } {
    this.requireAccount(args.venueAccountId);
    if (!this.priceMarks[args.instrumentId]) this.priceMarks[args.instrumentId] = d(1);
    const px = this.priceOf(args.instrumentId);
    const usd = args.amount.mul(px);
    const borrowId = this.nextLot('b');
    this.borrows.push({
      id: borrowId,
      venueAccountId: args.venueAccountId,
      instrumentId: args.instrumentId,
      principal: args.amount,
      accruedInterest: ZERO,
      apr: args.apr,
      priceMark: px,
      ...(args.venue ? { venue: args.venue } : {}),
    });
    const cashRole = args.cashRole ?? 'cash';
    const cashHoldingId = this.addCash(
      args.cashVenueAccountId,
      args.instrumentId,
      args.amount,
      cashRole,
    );
    const entry = this.post({
      at: args.at,
      kind: 'borrow',
      ...(args.intentHash ? { intentHash: args.intentHash } : {}),
      memo: `Borrow ${args.amount.toString()} ${args.instrumentId} (principal; not income)`,
      instrumentId: args.instrumentId,
      lines: [
        {
          account: GL_FOR_ROLE[cashRole],
          side: 'debit',
          amount: usd,
          quantity: args.amount,
          instrumentId: args.instrumentId,
          venueAccountId: args.cashVenueAccountId,
          holdingId: cashHoldingId,
        },
        {
          account: 'borrow_principal',
          side: 'credit',
          amount: usd,
          quantity: args.amount,
          instrumentId: args.instrumentId,
        },
      ],
    });
    return { entry, borrowId, cashHoldingId };
  }

  accrueInterest(args: { at: string; borrowId: string; days: number }): JournalEntry {
    const b = this.borrows.find((x) => x.id === args.borrowId);
    if (!b) throw new Error(`unknown borrow ${args.borrowId}`);
    const base = b.principal.plus(b.accruedInterest);
    const interestQty = base.mul(b.apr).mul(d(args.days)).div(DAYS_PER_YEAR);
    const usd = interestQty.mul(b.priceMark);
    b.accruedInterest = b.accruedInterest.plus(interestQty);
    return this.post({
      at: args.at,
      kind: 'accrue_interest',
      memo: `Accrue ${args.days}d interest on ${b.id}`,
      instrumentId: b.instrumentId,
      lines: [
        { account: 'financing_cost', side: 'debit', amount: usd },
        {
          account: 'accrued_interest',
          side: 'credit',
          amount: usd,
          quantity: interestQty,
          instrumentId: b.instrumentId,
        },
      ],
    });
  }

  creditIncome(args: {
    at: string;
    kind: Extract<EconomicKind, 'staking' | 'lending' | 'funding' | 'lp' | 'incentive'>;
    amount: Decimal;
    instrumentId: string;
    quantity?: Decimal;
    holdingId?: string;
    venueAccountId?: string;
    role?: HoldingRole;
    memo?: string;
  }): JournalEntry {
    const incomeAccount: AccountId =
      args.kind === 'staking'
        ? 'staking_income'
        : args.kind === 'lending'
          ? 'lending_income'
          : args.kind === 'funding'
            ? 'funding_income'
            : args.kind === 'lp'
              ? 'lp_income'
              : 'incentives';
    let debitAccount: AccountId = 'cash';
    let holdingId = args.holdingId;
    const qty = args.quantity ?? args.amount.div(this.priceOf(args.instrumentId));
    if (holdingId) {
      const h = this.holding(holdingId);
      h.quantity = h.quantity.plus(qty);
      h.costBasisUsd = h.costBasisUsd.plus(args.amount);
      debitAccount = GL_FOR_ROLE[h.role];
    } else {
      const venue = args.venueAccountId ?? this.meta.accounts[0]!.id;
      const role = args.role ?? 'cash';
      holdingId = this.addCash(venue, args.instrumentId, qty, role);
      debitAccount = GL_FOR_ROLE[role];
    }
    return this.post({
      at: args.at,
      kind: args.kind,
      memo: args.memo ?? `${args.kind} ${args.amount.toString()}`,
      instrumentId: args.instrumentId,
      priceMark: this.priceOf(args.instrumentId),
      lines: [
        {
          account: debitAccount,
          side: 'debit',
          amount: args.amount,
          quantity: qty,
          instrumentId: args.instrumentId,
          holdingId,
        },
        { account: incomeAccount, side: 'credit', amount: args.amount },
      ],
    });
  }

  chargeFee(args: { at: string; amount: Decimal; holdingId: string; memo?: string }): JournalEntry {
    const { holding } = this.reduceHolding(args.holdingId, args.amount);
    return this.post({
      at: args.at,
      kind: 'fee',
      memo: args.memo ?? `Fee ${args.amount.toString()}`,
      lines: [
        { account: 'fees', side: 'debit', amount: args.amount },
        {
          account: GL_FOR_ROLE[holding.role],
          side: 'credit',
          amount: args.amount,
          quantity: args.amount,
          instrumentId: holding.instrumentId,
          holdingId: args.holdingId,
        },
      ],
    });
  }

  markInstrument(args: { at: string; instrumentId: string; price: Decimal }): JournalEntry | null {
    const old = this.priceOf(args.instrumentId);
    if (old.eq(args.price)) return null;
    this.priceMarks[args.instrumentId] = args.price;
    const lots = this.holdings.filter((h) => h.instrumentId === args.instrumentId);
    const delta = lots.reduce((s, h) => {
      const change = h.quantity.mul(args.price.minus(old));
      return s.plus(change);
    }, ZERO);
    if (delta.eq(0)) return null;
    const gain = delta.gt(0);
    const byGl = new Map<AccountId, Decimal>();
    for (const h of lots) {
      const gl = GL_FOR_ROLE[h.role];
      const change = h.quantity.mul(args.price.minus(old));
      byGl.set(gl, (byGl.get(gl) ?? ZERO).plus(change));
    }
    const lines: JournalLine[] = [];
    for (const [account, amt] of byGl) {
      if (amt.eq(0)) continue;
      if (amt.gt(0))
        lines.push({ account, side: 'debit', amount: amt, instrumentId: args.instrumentId });
      else
        lines.push({ account, side: 'credit', amount: amt.abs(), instrumentId: args.instrumentId });
    }
    if (gain) lines.push({ account: 'unrealized_pnl', side: 'credit', amount: delta });
    else lines.push({ account: 'unrealized_pnl', side: 'debit', amount: delta.abs() });
    return this.post({
      at: args.at,
      kind: 'mark',
      memo: `Mark ${args.instrumentId} ${old.toString()} → ${args.price.toString()}`,
      instrumentId: args.instrumentId,
      priceMark: args.price,
      lines,
    });
  }

  liquidation(args: {
    at: string;
    holdingId: string;
    quantitySeized: Decimal;
    borrowId: string;
    debtRepaidUsd: Decimal;
  }): JournalEntry {
    const { releasedCost, holding } = this.reduceHolding(args.holdingId, args.quantitySeized);
    const fv = args.quantitySeized.mul(this.priceOf(holding.instrumentId));
    const b = this.borrows.find((x) => x.id === args.borrowId);
    if (!b) throw new Error(`unknown borrow ${args.borrowId}`);
    const loss = fv.minus(args.debtRepaidUsd);
    const accruedUsd = b.accruedInterest.mul(b.priceMark);
    const principalUsd = b.principal.mul(b.priceMark);
    let remain = args.debtRepaidUsd;
    const againstAccrued = remain.lt(accruedUsd) ? remain : accruedUsd;
    remain = remain.minus(againstAccrued);
    const againstPrincipal = remain.lt(principalUsd) ? remain : principalUsd;
    b.accruedInterest = b.accruedInterest.minus(againstAccrued.div(b.priceMark));
    b.principal = b.principal.minus(againstPrincipal.div(b.priceMark));
    const lines: JournalLine[] = [
      {
        account: 'collateral_assets',
        side: 'credit',
        amount: fv,
        quantity: args.quantitySeized,
        instrumentId: holding.instrumentId,
        holdingId: args.holdingId,
      },
    ];
    if (againstPrincipal.gt(0)) {
      lines.push({ account: 'borrow_principal', side: 'debit', amount: againstPrincipal });
    }
    if (againstAccrued.gt(0)) {
      lines.push({ account: 'accrued_interest', side: 'debit', amount: againstAccrued });
    }
    if (loss.gt(0)) lines.push({ account: 'liquidation_loss', side: 'debit', amount: loss });
    if (loss.lt(0)) lines.push({ account: 'realized_pnl', side: 'credit', amount: loss.abs() });
    // Unwind cost basis vs FV into unrealized if needed: seized FV should equal book of that slice.
    const bookGap = fv.minus(releasedCost);
    if (!bookGap.eq(0)) {
      // The GL collateral account is carried at FV after marks; releasedCost is historical. No extra line.
      void releasedCost;
    }
    assertBalanced(lines, 'liquidation-preview');
    return this.post({
      at: args.at,
      kind: 'liquidation',
      memo: `Liquidation seized ${args.quantitySeized.toString()} ${holding.instrumentId}`,
      instrumentId: holding.instrumentId,
      lines,
    });
  }

  otherLoss(args: { at: string; amount: Decimal; holdingId: string; memo?: string }): JournalEntry {
    const { holding } = this.reduceHolding(args.holdingId, args.amount);
    return this.post({
      at: args.at,
      kind: 'other_loss',
      memo: args.memo ?? `Other loss ${args.amount.toString()}`,
      lines: [
        { account: 'other_loss', side: 'debit', amount: args.amount },
        {
          account: GL_FOR_ROLE[holding.role],
          side: 'credit',
          amount: args.amount,
          instrumentId: holding.instrumentId,
          holdingId: args.holdingId,
        },
      ],
    });
  }

  toBalanceSheet(asOf?: string): BalanceSheet {
    const last = this.entries[this.entries.length - 1];
    const holdings: BsHolding[] = this.holdings
      .filter((h) => h.quantity.gt(0))
      .map((h) => {
        const inst = this.instrument(h.instrumentId);
        return {
          id: h.id,
          accountId: h.venueAccountId,
          asset: {
            id: inst.id,
            symbol: inst.symbol,
            assetClass: inst.assetClass,
            ...(inst.network ? { network: inst.network } : {}),
            liquidityTier: inst.liquidityTier,
            isStable: inst.isStable,
            isYieldBearing: inst.isYieldBearing,
          },
          quantity: h.quantity,
          priceMark: this.priceOf(h.instrumentId),
        };
      });
    const liabilities: BsLiability[] = this.borrows
      .filter((b) => b.principal.plus(b.accruedInterest).gt(0))
      .map((b) => ({
        id: b.id,
        accountId: b.venueAccountId,
        symbol: this.instrument(b.instrumentId).symbol,
        principal: b.principal,
        accruedInterest: b.accruedInterest,
        priceMark: b.priceMark,
        rateType: 'variable' as const,
        currentApr: b.apr,
        ...(b.venue ? { venue: b.venue } : {}),
      }));
    const byPos = new Map<string, HoldingLot[]>();
    for (const h of this.holdings) {
      if (h.role !== 'collateral' || !h.collateralPositionId) continue;
      const arr = byPos.get(h.collateralPositionId) ?? [];
      arr.push(h);
      byPos.set(h.collateralPositionId, arr);
    }
    const collateralPositions = [...byPos.entries()].map(([id, lots]) => {
      const venueAccountId = lots[0]!.venueAccountId;
      const inst = this.instrument(lots[0]!.instrumentId);
      const params = inst.collateralParams;
      if (!params) throw new Error(`instrument ${inst.id} pledged without collateralParams`);
      return {
        id,
        accountId: venueAccountId,
        venue:
          this.meta.accounts.find((a) => a.id === venueAccountId)?.institution ?? venueAccountId,
        ...(inst.network ? { network: inst.network } : {}),
        collateral: lots.map((h) => ({ holdingId: h.id, params })),
        liabilityIds: liabilities.map((l) => l.id),
      };
    });
    return {
      asOf: asOf ?? last?.at ?? this.meta.createdAt,
      currency: this.meta.currency,
      accounts: this.meta.accounts,
      holdings,
      liabilities,
      collateralPositions,
      contingentObligations: [],
    };
  }

  positionHealth() {
    const bs = this.toBalanceSheet();
    return bs.collateralPositions.map((p) => evaluateCollateralPosition(bs, p));
  }

  findHolding(pred: (h: HoldingLot) => boolean): HoldingLot | undefined {
    return this.holdings.find(pred);
  }
}
