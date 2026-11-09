import { d } from '@shadow-banking/core';
import { Ledger } from './ledger.js';
import type { HoldingLot, LedgerMeta } from './types.js';

/** $1,000 seed paper book (spec starting assumption). Not a live strategy. */
export const SEED_1K_META: LedgerMeta = {
  currency: 'USD',
  createdAt: '2026-01-01T00:00:00Z',
  label: '$1,000 seed fixture (paper book, 90 days)',
  defaultHurdleApy: d('0.10'),
  accounts: [
    {
      id: 'wallet',
      kind: 'wallet',
      institution: 'self-custody',
      network: 'ethereum',
      custody: 'self_custody_user',
      scope: 'managed',
    },
    {
      id: 'reserve',
      kind: 'wallet',
      institution: 'self-custody reserve',
      network: 'ethereum',
      custody: 'self_custody_user',
      scope: 'managed',
    },
    {
      id: 'aave',
      kind: 'lending',
      institution: 'Aave v3',
      network: 'ethereum',
      custody: 'self_custody_user',
      scope: 'managed',
    },
  ],
  instruments: {
    USDC: {
      id: 'USDC',
      symbol: 'USDC',
      assetClass: 'stablecoin',
      network: 'ethereum',
      liquidityTier: 'T0',
      isStable: true,
      isYieldBearing: false,
    },
    wstETH: {
      id: 'wstETH',
      symbol: 'wstETH',
      assetClass: 'liquid_staking_token',
      network: 'ethereum',
      liquidityTier: 'T1',
      isStable: false,
      isYieldBearing: true,
      collateralParams: {
        ltv: d('0.93'),
        liquidationThreshold: d('0.95'),
        liquidationBonus: d('0.01'),
        eMode: true,
        eModeCategory: 'ETH correlated',
      },
    },
  },
};

function requireHolding(ledger: Ledger, pred: (h: HoldingLot) => boolean, msg: string): HoldingLot {
  const h = ledger.findHolding(pred);
  if (!h) throw new Error(msg);
  return h;
}

/** Paper activity on a $1,000 seed: reserve, unlevered-ish wstETH collateral, $150 borrow (not income). */
export function buildSeed1kFixture(): Ledger {
  const l = new Ledger(SEED_1K_META);
  const t0 = '2026-01-01T00:00:00Z';

  l.seed({ at: t0, amount: d(1000), venueAccountId: 'wallet', instrumentId: 'USDC' });
  const working = requireHolding(
    l,
    (h) => h.venueAccountId === 'wallet' && h.role === 'cash',
    'seed cash missing',
  );

  l.transferCash({
    at: t0,
    amount: d(200),
    fromHoldingId: working.id,
    toVenueAccountId: 'reserve',
    toRole: 'reserve',
    memo: 'Set aside liquid reserve (inter-account; not profit)',
  });

  const acquired = l.acquire({
    at: t0,
    instrumentId: 'wstETH',
    quantity: d('0.26'),
    price: d('3034.78'),
    cashHoldingId: working.id,
    venueAccountId: 'aave',
    role: 'productive',
    fee: d('2.50'),
  });
  l.pledge({
    at: t0,
    holdingId: acquired.holdingId,
    collateralPositionId: 'aave-wsteth-eth',
  });

  const { cashHoldingId: borrowedCash } = l.borrow({
    at: t0,
    amount: d(150),
    instrumentId: 'USDC',
    venueAccountId: 'aave',
    cashVenueAccountId: 'wallet',
    apr: d('0.025'),
    venue: 'Aave v3',
    intentHash: 'fixture-borrow-150-usdc',
  });
  l.transferCash({
    at: t0,
    amount: d(150),
    fromHoldingId: borrowedCash,
    toVenueAccountId: 'reserve',
    toRole: 'reserve',
    memo: 'Park borrowed USDC in reserve (principal is not income)',
  });

  const reserve = requireHolding(
    l,
    (h) => h.venueAccountId === 'reserve' && h.role === 'reserve',
    'reserve missing',
  );
  l.transferCash({
    at: t0,
    amount: d(100),
    fromHoldingId: reserve.id,
    toVenueAccountId: 'aave',
    toRole: 'cash',
    memo: 'Move USDC to Aave to supply (reclass; not profit)',
  });
  const aaveCash = requireHolding(
    l,
    (h) => h.venueAccountId === 'aave' && h.instrumentId === 'USDC' && h.role === 'cash',
    'aave cash missing',
  );
  l.supplyLending({ at: t0, holdingId: aaveCash.id });

  const wst = requireHolding(l, (h) => h.instrumentId === 'wstETH', 'wstETH missing');
  const lending = requireHolding(l, (h) => h.role === 'lending', 'lending lot missing');
  const borrow = l.getBorrows()[0];
  if (!borrow) throw new Error('borrow missing');

  const tJan = '2026-01-31T00:00:00Z';
  l.markInstrument({ at: tJan, instrumentId: 'wstETH', price: d('3080') });
  l.creditIncome({
    at: tJan,
    kind: 'staking',
    quantity: d('0.00048'),
    amount: d('0.00048').mul(d('3080')),
    instrumentId: 'wstETH',
    holdingId: wst.id,
    memo: 'Staking reward credited as more wstETH',
  });
  l.creditIncome({
    at: tJan,
    kind: 'lending',
    amount: d('0.21'),
    instrumentId: 'USDC',
    holdingId: lending.id,
    memo: 'USDC supply interest',
  });
  l.accrueInterest({ at: tJan, borrowId: borrow.id, days: 30 });

  const tFebFund = '2026-02-15T00:00:00Z';
  l.creditIncome({
    at: tFebFund,
    kind: 'funding',
    amount: d('0.55'),
    instrumentId: 'USDC',
    venueAccountId: 'wallet',
    role: 'cash',
    memo: 'Funding received on hedge stub',
  });
  l.creditIncome({
    at: tFebFund,
    kind: 'lp',
    amount: d('0.30'),
    instrumentId: 'USDC',
    venueAccountId: 'wallet',
    role: 'cash',
    memo: 'LP fee income (small)',
  });

  const tFeb = '2026-02-28T00:00:00Z';
  l.markInstrument({ at: tFeb, instrumentId: 'wstETH', price: d('3010') });
  l.creditIncome({
    at: tFeb,
    kind: 'staking',
    quantity: d('0.00045'),
    amount: d('0.00045').mul(d('3010')),
    instrumentId: 'wstETH',
    holdingId: wst.id,
  });
  l.creditIncome({
    at: tFeb,
    kind: 'lending',
    amount: d('0.19'),
    instrumentId: 'USDC',
    holdingId: lending.id,
  });
  l.accrueInterest({ at: tFeb, borrowId: borrow.id, days: 28 });

  const tMar1 = '2026-03-01T00:00:00Z';
  l.creditIncome({
    at: tMar1,
    kind: 'incentive',
    amount: d('0.75'),
    instrumentId: 'USDC',
    venueAccountId: 'reserve',
    role: 'reserve',
    memo: 'Protocol incentive',
  });
  l.withdraw({ at: tMar1, amount: d(25), holdingId: reserve.id, source: 'user' });

  const tMar = '2026-03-31T00:00:00Z';
  l.markInstrument({ at: tMar, instrumentId: 'wstETH', price: d('3120') });
  l.creditIncome({
    at: tMar,
    kind: 'staking',
    quantity: d('0.00050'),
    amount: d('0.00050').mul(d('3120')),
    instrumentId: 'wstETH',
    holdingId: wst.id,
  });
  l.creditIncome({
    at: tMar,
    kind: 'lending',
    amount: d('0.22'),
    instrumentId: 'USDC',
    holdingId: lending.id,
  });
  l.accrueInterest({ at: tMar, borrowId: borrow.id, days: 31 });
  const feeCash = requireHolding(
    l,
    (h) => h.venueAccountId === 'wallet' && h.role === 'cash',
    'no cash for fee',
  );
  l.chargeFee({ at: tMar, amount: d('1.10'), holdingId: feeCash.id, memo: 'Gas / tx fees' });

  return l;
}
