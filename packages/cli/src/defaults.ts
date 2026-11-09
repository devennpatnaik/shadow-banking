import {
  d,
  parseDisclosureProfile,
  type BalanceSheet,
  type DisclosureProfile,
  type DisclosureProfileInput,
} from '@shadow-banking/core';

/** $1,000 paper book: idle USDC, no debt, managed self-custody. Phases 1–4 default. */
export function defaultPaperBook(): BalanceSheet {
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
    holdings: [
      {
        id: 'h-usdc',
        accountId: 'paper-wallet',
        asset: {
          id: 'USDC',
          symbol: 'USDC',
          assetClass: 'stablecoin',
          network: 'base',
          liquidityTier: 'T0',
          isStable: true,
          isYieldBearing: false,
        },
        quantity: d(1000),
        priceMark: d(1),
        priceSource: 'paper (no live price feed)',
      },
    ],
    liabilities: [],
    collateralPositions: [],
    contingentObligations: [],
  };
}

export function defaultDisclosureInput(): DisclosureProfileInput {
  return {
    income: { monthlyNet: 0, stability: 'none' },
    recurringExpenses: [],
    existingDebts: [],
    emergencySavings: 0,
    nearTermCashNeeds: [],
    horizonMonths: 12,
    riskTolerance: 'conservative',
    tax: { residencyCountry: 'US', notes: 'paper default; replace with a real disclosure file' },
    restrictions: {
      allowLeverage: true,
      allowDerivatives: false,
      excludedAssetClasses: [],
      excludedNetworks: [],
      excludedProtocols: [],
    },
  };
}

export function defaultDisclosure(): DisclosureProfile {
  return parseDisclosureProfile(defaultDisclosureInput());
}

export const DEFAULT_HURDLE = d('0.10');
export const DEFAULT_SEED = d(1000);
