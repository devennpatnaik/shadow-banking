import { Ledger, type LedgerMeta } from '@shadow-banking/accounting';
import { d, type Decimal } from '@shadow-banking/core';

export function idlePaperMeta(args: {
  asOf: string;
  seedUsd: Decimal;
  hurdleApy: Decimal;
}): LedgerMeta {
  return {
    currency: 'USD',
    createdAt: args.asOf,
    label: `Paper book · seed ${args.seedUsd.toFixed(2)} (no live txs)`,
    defaultHurdleApy: args.hurdleApy,
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
      WETH: {
        id: 'WETH',
        symbol: 'WETH',
        assetClass: 'native_crypto',
        network: 'ethereum',
        liquidityTier: 'T0',
        isStable: false,
        isYieldBearing: false,
      },
    },
  };
}

export function seedIdlePaperLedger(args: {
  asOf: string;
  seedUsd: Decimal;
  hurdleApy: Decimal;
  reserveRate: Decimal;
}): Ledger {
  const ledger = new Ledger(idlePaperMeta(args));
  ledger.seed({
    at: args.asOf,
    amount: args.seedUsd,
    venueAccountId: 'wallet',
    instrumentId: 'USDC',
    source: 'paper-controller',
  });
  const cash = ledger.findHolding((h) => h.venueAccountId === 'wallet' && h.role === 'cash');
  if (!cash) throw new Error('paper seed cash missing');
  const reserve = args.seedUsd.mul(args.reserveRate);
  if (reserve.gt(0) && reserve.lt(args.seedUsd)) {
    ledger.transferCash({
      at: args.asOf,
      amount: reserve,
      fromHoldingId: cash.id,
      toVenueAccountId: 'reserve',
      toRole: 'reserve',
      memo: 'Reserve first (inter-account; not profit). Hold liquid unless a strategy clears the hurdle and the governor approves.',
    });
  }
  return ledger;
}

export function workingCashId(ledger: Ledger): string {
  const wallet = ledger.findHolding(
    (h) => h.venueAccountId === 'wallet' && h.role === 'cash' && h.quantity.gt(0),
  );
  if (wallet) return wallet.id;
  const cash = ledger.findHolding(
    (h) =>
      h.instrumentId === 'USDC' && (h.role === 'cash' || h.role === 'reserve') && h.quantity.gt(0),
  );
  if (!cash) {
    const any = ledger.getHoldings().find((h) => h.quantity.gt(0));
    if (!any) throw new Error('no cash holding on paper ledger');
    return any.id;
  }
  return cash.id;
}
