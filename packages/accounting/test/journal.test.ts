import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { d } from '@shadow-banking/core';
import { Ledger } from '../src/ledger.js';
import { loadLedger, saveLedger } from '../src/persist.js';
import { SEED_1K_META } from '../src/fixture.js';

function expectDec(actual: { toString(): string } | null, expected: string): void {
  if (actual === null) throw new Error(`expected ${expected}, got null`);
  expect(actual.toString()).toBe(d(expected).toString());
}

function fresh(): Ledger {
  return new Ledger({ ...SEED_1K_META, label: 'unit' });
}

describe('double-entry ledger', () => {
  it('keeps NAV = assets − liabilities after seed', () => {
    const l = fresh();
    l.seed({
      at: '2026-01-01T00:00:00Z',
      amount: d(1000),
      venueAccountId: 'wallet',
      instrumentId: 'USDC',
    });
    expectDec(l.nav(), '1000');
    expectDec(l.grossAssets(), '1000');
    expectDec(l.totalDebt(), '0');
    expectDec(l.netPnl(), '0');
  });

  it('does not count borrowed principal as income', () => {
    const l = fresh();
    l.seed({
      at: '2026-01-01T00:00:00Z',
      amount: d(1000),
      venueAccountId: 'wallet',
      instrumentId: 'USDC',
    });
    l.borrow({
      at: '2026-01-01T00:00:00Z',
      amount: d(400),
      instrumentId: 'USDC',
      venueAccountId: 'aave',
      cashVenueAccountId: 'wallet',
      apr: d('0.05'),
      venue: 'Aave v3',
    });
    expectDec(l.nav(), '1000');
    expectDec(l.netPnl(), '0');
    expectDec(l.realizedPnl(), '0');
    expectDec(l.grossAssets(), '1400');
    expectDec(l.totalDebt(), '400');
    expectDec(l.incomeTotal(), '0');
  });

  it('does not treat inter-account transfers as profit', () => {
    const l = fresh();
    l.seed({
      at: '2026-01-01T00:00:00Z',
      amount: d(1000),
      venueAccountId: 'wallet',
      instrumentId: 'USDC',
    });
    const cash = l.findHolding((h) => h.role === 'cash');
    if (!cash) throw new Error('missing cash');
    l.transferCash({
      at: '2026-01-01T00:00:00Z',
      amount: d(250),
      fromHoldingId: cash.id,
      toVenueAccountId: 'reserve',
      toRole: 'reserve',
    });
    expectDec(l.nav(), '1000');
    expectDec(l.netPnl(), '0');
    expectDec(l.liquidReserves(), '1000');
  });

  it('treats deposits and withdrawals as equity, not P&L', () => {
    const l = fresh();
    l.seed({
      at: '2026-01-01T00:00:00Z',
      amount: d(1000),
      venueAccountId: 'wallet',
      instrumentId: 'USDC',
    });
    l.deposit({
      at: '2026-02-01T00:00:00Z',
      amount: d(200),
      venueAccountId: 'wallet',
      instrumentId: 'USDC',
    });
    expectDec(l.nav(), '1200');
    expectDec(l.netPnl(), '0');
    const cash = l.findHolding((h) => h.venueAccountId === 'wallet');
    if (!cash) throw new Error('missing cash');
    l.withdraw({ at: '2026-03-01T00:00:00Z', amount: d(50), holdingId: cash.id });
    expectDec(l.nav(), '1150');
    expectDec(l.netPnl(), '0');
    expectDec(l.netContributed(), '1150');
  });

  it('rejects a borrow that credits income', () => {
    const l = fresh();
    l.seed({
      at: '2026-01-01T00:00:00Z',
      amount: d(1000),
      venueAccountId: 'wallet',
      instrumentId: 'USDC',
    });
    expect(() =>
      l.post({
        at: '2026-01-01T00:00:00Z',
        kind: 'borrow',
        memo: 'illegal',
        lines: [
          { account: 'cash', side: 'debit', amount: d(10) },
          { account: 'staking_income', side: 'credit', amount: d(10) },
        ],
      }),
    ).toThrow(/cannot post to income/);
  });

  it('is idempotent on intentHash', () => {
    const l = fresh();
    l.seed({
      at: '2026-01-01T00:00:00Z',
      amount: d(1000),
      venueAccountId: 'wallet',
      instrumentId: 'USDC',
    });
    const args = {
      at: '2026-01-01T00:00:00Z',
      amount: d(50),
      instrumentId: 'USDC',
      venueAccountId: 'aave',
      cashVenueAccountId: 'wallet',
      apr: d('0.02'),
      intentHash: 'intent-1',
    } as const;
    l.borrow(args);
    l.borrow(args);
    expectDec(l.totalDebt(), '50');
    expect(l.getEntries().filter((e) => e.kind === 'borrow')).toHaveLength(1);
  });

  it('books fees and interest as expenses and marks as unrealized', () => {
    const l = fresh();
    l.seed({
      at: '2026-01-01T00:00:00Z',
      amount: d(1000),
      venueAccountId: 'wallet',
      instrumentId: 'USDC',
    });
    const cash = l.findHolding((h) => h.role === 'cash');
    if (!cash) throw new Error('missing cash');
    const { holdingId } = l.acquire({
      at: '2026-01-01T00:00:00Z',
      instrumentId: 'wstETH',
      quantity: d('0.1'),
      price: d('3000'),
      cashHoldingId: cash.id,
      venueAccountId: 'aave',
      fee: d('2'),
    });
    expectDec(l.nav(), '998');
    expectDec(l.realizedPnl(), '-2');
    l.pledge({ at: '2026-01-01T00:00:00Z', holdingId, collateralPositionId: 'p1' });
    l.markInstrument({ at: '2026-02-01T00:00:00Z', instrumentId: 'wstETH', price: d('3300') });
    expectDec(l.unrealizedPnl(), '30');
    expectDec(l.netPnl(), '28');
    expectDec(l.nav(), '1028');
  });

  it('round-trips through a ledger directory', () => {
    const l = fresh();
    l.seed({
      at: '2026-01-01T00:00:00Z',
      amount: d(1000),
      venueAccountId: 'wallet',
      instrumentId: 'USDC',
    });
    const dir = mkdtempSync(join(tmpdir(), 'ledger-'));
    saveLedger(l, dir);
    const loaded = loadLedger(dir);
    expectDec(loaded.nav(), '1000');
    expect(loaded.getEntries()).toHaveLength(1);
  });
});
