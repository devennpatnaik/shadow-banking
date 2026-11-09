import { expect } from 'vitest';
import { d, type Decimal, type BalanceSheet, type DisclosureProfileInput } from '../src/index.js';

/** Compare Decimals exactly (or to `dp` decimals when a value is non-terminating). */
export function expectDec(actual: Decimal | null, expected: string, dp?: number): void {
  if (actual === null) throw new Error(`expected ${expected}, got null`);
  if (dp === undefined) expect(actual.toString()).toBe(d(expected).toString());
  else expect(actual.toFixed(dp)).toBe(d(expected).toFixed(dp));
}

/**
 * Hand-built balance sheet used across tests.
 *
 *   bank   (observed)  USD cash          5,000          T0
 *   wallet (managed)   USDC 300          300            T0
 *   wallet (managed)   ETH 0.5 @ 2,000   1,000          T1
 *   wallet (managed)   stETH claim 0.1   200            T2 (withdrawal queue)
 *   aave   (managed)   wstETH 1 @ 2,400  2,400          T3 (pledged, E-mode 93/95/1)
 *   aave   (managed)   debt WETH 0.8 @ 2,000 = 1,600 (0.75 principal + 0.05 accrued)
 *   venue  (managed)   contingent margin 100
 *
 *   assets 8,900 · liabilities 1,600 · NAV 7,300
 */
export function fixtureBalanceSheet(): BalanceSheet {
  return {
    asOf: '2026-10-21T00:00:00Z',
    currency: 'USD',
    accounts: [
      {
        id: 'bank',
        kind: 'bank',
        institution: 'Example Bank',
        custody: 'external',
        scope: 'observed',
      },
      {
        id: 'wallet',
        kind: 'wallet',
        institution: 'self-custody',
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
      {
        id: 'venue',
        kind: 'venue',
        institution: 'Perp venue',
        custody: 'external',
        scope: 'managed',
      },
    ],
    holdings: [
      {
        id: 'h-cash',
        accountId: 'bank',
        asset: {
          id: 'USD',
          symbol: 'USD',
          assetClass: 'cash',
          liquidityTier: 'T0',
          isStable: true,
          isYieldBearing: false,
        },
        quantity: d(5000),
        priceMark: d(1),
      },
      {
        id: 'h-usdc',
        accountId: 'wallet',
        asset: {
          id: 'USDC',
          symbol: 'USDC',
          assetClass: 'stablecoin',
          liquidityTier: 'T0',
          isStable: true,
          isYieldBearing: false,
        },
        quantity: d(300),
        priceMark: d(1),
      },
      {
        id: 'h-eth',
        accountId: 'wallet',
        asset: {
          id: 'ETH',
          symbol: 'ETH',
          assetClass: 'native_crypto',
          liquidityTier: 'T1',
          isStable: false,
          isYieldBearing: false,
        },
        quantity: d('0.5'),
        priceMark: d(2000),
      },
      {
        id: 'h-steth-claim',
        accountId: 'wallet',
        asset: {
          id: 'stETH-claim',
          symbol: 'stETH',
          assetClass: 'liquid_staking_token',
          liquidityTier: 'T2',
          isStable: false,
          isYieldBearing: false,
          redemptionDelayDays: 5,
        },
        quantity: d('0.1'),
        priceMark: d(2000),
      },
      {
        id: 'h-wsteth',
        accountId: 'aave',
        asset: {
          id: 'wstETH',
          symbol: 'wstETH',
          assetClass: 'liquid_staking_token',
          liquidityTier: 'T1',
          isStable: false,
          isYieldBearing: true,
          yieldApy: d('0.0222'),
        },
        quantity: d(1),
        priceMark: d(2400),
      },
    ],
    liabilities: [
      {
        id: 'l-weth',
        accountId: 'aave',
        symbol: 'WETH',
        principal: d('0.75'),
        accruedInterest: d('0.05'),
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
    contingentObligations: [{ id: 'c-margin', accountId: 'venue', kind: 'margin', amount: d(100) }],
  };
}

/**
 *   income 4,000/mo stable · expenses 1,500 + 500 · debts: card 1,000 @ 24% (min 50),
 *   student loan 10,000 @ 5% (min 100) · emergency savings 3,000 ·
 *   near-term: tax 1,200 in 3 months, trip 800 in 18 months · horizon 24 months · moderate
 */
export function fixtureDisclosure(): DisclosureProfileInput {
  return {
    income: { monthlyNet: 4000, stability: 'stable' },
    recurringExpenses: [
      { label: 'rent', monthlyAmount: 1500 },
      { label: 'food', monthlyAmount: '500' },
    ],
    existingDebts: [
      { label: 'credit card', balance: 1000, annualRate: 0.24, minimumMonthlyPayment: 50 },
      { label: 'student loan', balance: 10000, annualRate: '0.05', minimumMonthlyPayment: 100 },
    ],
    emergencySavings: 3000,
    nearTermCashNeeds: [
      { label: 'tax bill', amount: 1200, dueInMonths: 3 },
      { label: 'trip', amount: 800, dueInMonths: 18 },
    ],
    horizonMonths: 24,
    riskTolerance: 'moderate',
    tax: { residencyCountry: 'US' },
  };
}
