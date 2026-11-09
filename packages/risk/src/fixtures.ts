import {
  d,
  parseDisclosureProfile,
  type BalanceSheet,
  type Decimal,
  type DisclosureProfile,
} from '@shadow-banking/core';
import type { FixtureName } from './types.js';

/** Minimal disclosure: no household drain, so RC is driven by the strategy reserve vs T0. */
export function paperDisclosure(): DisclosureProfile {
  return parseDisclosureProfile({
    income: { monthlyNet: 0, stability: 'none' },
    recurringExpenses: [],
    existingDebts: [],
    emergencySavings: 0,
    nearTermCashNeeds: [],
    horizonMonths: 12,
    riskTolerance: 'conservative',
    tax: { residencyCountry: 'US', notes: 'paper fixture' },
    restrictions: {
      allowLeverage: true,
      allowDerivatives: false,
      excludedAssetClasses: [],
      excludedNetworks: [],
      excludedProtocols: [],
    },
  });
}

function usdHolding(id: string, accountId: string, qty: Decimal): BalanceSheet['holdings'][number] {
  return {
    id,
    accountId,
    asset: {
      id: 'USDC',
      symbol: 'USDC',
      assetClass: 'stablecoin',
      network: 'ethereum',
      liquidityTier: 'T0',
      isStable: true,
      isYieldBearing: false,
    },
    quantity: qty,
    priceMark: d(1),
    priceSource: 'paper fixture',
  };
}

/**
 * Uncorrelated ETH collateral / USDC debt. HF = collateralUsd × LT / debtUsd.
 * LT 0.83 (typical non-E-mode).
 */
export function uncorrelatedLendingBook(opts: {
  collateralUsd: Decimal;
  debtUsd: Decimal;
  reserveUsd: Decimal;
  asOf?: string;
}): BalanceSheet {
  const qtyEth = opts.collateralUsd.div(2000);
  return {
    asOf: opts.asOf ?? '2026-10-21T00:00:00Z',
    currency: 'USD',
    accounts: [
      {
        id: 'wallet',
        kind: 'wallet',
        institution: 'paper',
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
    holdings: [
      usdHolding('h-usdc', 'wallet', opts.reserveUsd),
      {
        id: 'h-eth',
        accountId: 'aave',
        asset: {
          id: 'ETH',
          symbol: 'ETH',
          assetClass: 'native_crypto',
          network: 'ethereum',
          liquidityTier: 'T1',
          isStable: false,
          isYieldBearing: false,
        },
        quantity: qtyEth,
        priceMark: d(2000),
        priceSource: 'paper fixture',
      },
    ],
    liabilities: [
      {
        id: 'l-usdc',
        accountId: 'aave',
        symbol: 'USDC',
        principal: opts.debtUsd,
        accruedInterest: d(0),
        priceMark: d(1),
        rateType: 'variable',
        currentApr: d('0.04'),
        venue: 'aave-v3',
      },
    ],
    collateralPositions: [
      {
        id: 'pos-aave',
        accountId: 'aave',
        venue: 'aave-v3',
        network: 'ethereum',
        collateral: [
          {
            holdingId: 'h-eth',
            params: {
              ltv: d('0.80'),
              liquidationThreshold: d('0.83'),
              liquidationBonus: d('0.05'),
              eMode: false,
            },
          },
        ],
        liabilityIds: ['l-usdc'],
      },
    ],
    contingentObligations: [],
  };
}

/** Correlated E-mode wstETH / WETH. HF = collateralUsd × 0.95 / debtUsd. */
export function correlatedLendingBook(opts: {
  collateralUsd: Decimal;
  debtUsd: Decimal;
  reserveUsd: Decimal;
  asOf?: string;
}): BalanceSheet {
  return {
    asOf: opts.asOf ?? '2026-10-21T00:00:00Z',
    currency: 'USD',
    accounts: [
      {
        id: 'wallet',
        kind: 'wallet',
        institution: 'paper',
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
    holdings: [
      usdHolding('h-usdc', 'wallet', opts.reserveUsd),
      {
        id: 'h-wsteth',
        accountId: 'aave',
        asset: {
          id: 'wstETH',
          symbol: 'wstETH',
          assetClass: 'liquid_staking_token',
          network: 'ethereum',
          liquidityTier: 'T1',
          isStable: false,
          isYieldBearing: true,
          yieldApy: d('0.03'),
        },
        quantity: opts.collateralUsd.div(2400),
        priceMark: d(2400),
        priceSource: 'paper fixture',
      },
    ],
    liabilities: [
      {
        id: 'l-weth',
        accountId: 'aave',
        symbol: 'WETH',
        principal: opts.debtUsd.div(2000),
        accruedInterest: d(0),
        priceMark: d(2000),
        rateType: 'variable',
        currentApr: d('0.02'),
        venue: 'aave-v3',
      },
    ],
    collateralPositions: [
      {
        id: 'pos-aave',
        accountId: 'aave',
        venue: 'aave-v3',
        network: 'ethereum',
        collateral: [
          {
            holdingId: 'h-wsteth',
            params: {
              ltv: d('0.93'),
              liquidationThreshold: d('0.95'),
              liquidationBonus: d('0.01'),
              eMode: true,
              eModeCategory: 'ETH correlated',
            },
          },
        ],
        liabilityIds: ['l-weth'],
      },
    ],
    contingentObligations: [],
  };
}

export function idleBook(reserveUsd: Decimal = d(1000)): BalanceSheet {
  return {
    asOf: '2026-10-21T00:00:00Z',
    currency: 'USD',
    accounts: [
      {
        id: 'paper-wallet',
        kind: 'wallet',
        institution: 'paper',
        network: 'base',
        custody: 'self_custody_user',
        scope: 'managed',
      },
    ],
    holdings: [usdHolding('h-usdc', 'paper-wallet', reserveUsd)],
    liabilities: [],
    collateralPositions: [],
    contingentObligations: [],
  };
}

/**
 * Fixture books targeting each governor state via uncorrelated HF bands
 * (Caution < 1.60, Deleveraging < 1.35, Emergency < 1.15) plus reserve coverage.
 *
 * HF = 0.83 × collateral / debt.
 *   Caution HF ≈ 1.50 → debt = 0.83 × 3000 / 1.50 = 1660
 *   Delev  HF ≈ 1.25 → debt = 0.83 × 3000 / 1.25 = 1992
 *   Emerg  HF ≈ 1.10 → debt = 0.83 × 3000 / 1.10 = 2263.64
 */
export function fixtureBook(name: FixtureName): BalanceSheet {
  switch (name) {
    case 'normal':
      return idleBook(d(1000));
    case 'caution':
      return uncorrelatedLendingBook({
        collateralUsd: d(3000),
        debtUsd: d(1660),
        reserveUsd: d(400),
      });
    case 'deleveraging':
      return uncorrelatedLendingBook({
        collateralUsd: d(3000),
        debtUsd: d(1992),
        reserveUsd: d(50),
      });
    case 'emergency':
      return uncorrelatedLendingBook({
        collateralUsd: d(3000),
        debtUsd: d('2263.64'),
        reserveUsd: d(20),
      });
  }
}

export const FIXTURE_NAMES: readonly FixtureName[] = [
  'normal',
  'caution',
  'deleveraging',
  'emergency',
];
