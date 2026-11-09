import { readFileSync } from 'node:fs';
import {
  d,
  parseDisclosureProfile,
  type BalanceSheet,
  type CollateralParams,
  type Decimal,
  type DisclosureProfile,
  type Holding,
  type Liability,
} from '@shadow-banking/core';
import type { GovernorSnapshot } from '@shadow-banking/risk';

function obj(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function optStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
  return value;
}

function dec(value: unknown, label: string): Decimal {
  if (typeof value === 'number' || typeof value === 'string') return d(value);
  throw new Error(`${label} must be a number or numeric string`);
}

function arr(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

export function hydrateBalanceSheet(raw: unknown): BalanceSheet {
  const o = obj(raw, 'balance sheet');
  const accounts = arr(o['accounts'], 'accounts').map((a, i) => {
    const x = obj(a, `accounts[${i}]`);
    const account: BalanceSheet['accounts'][number] = {
      id: str(x['id'], `accounts[${i}].id`),
      kind: str(x['kind'], `accounts[${i}].kind`) as BalanceSheet['accounts'][number]['kind'],
      institution: str(x['institution'], `accounts[${i}].institution`),
      custody: str(
        x['custody'],
        `accounts[${i}].custody`,
      ) as BalanceSheet['accounts'][number]['custody'],
      scope: str(x['scope'], `accounts[${i}].scope`) as BalanceSheet['accounts'][number]['scope'],
    };
    const network = optStr(x['network']);
    const freshness = optStr(x['freshness']);
    if (network !== undefined) account.network = network;
    if (freshness !== undefined) account.freshness = freshness;
    return account;
  });

  const holdings: Holding[] = arr(o['holdings'], 'holdings').map((h, i) => {
    const x = obj(h, `holdings[${i}]`);
    const asset = obj(x['asset'], `holdings[${i}].asset`);
    const holding: Holding = {
      id: str(x['id'], `holdings[${i}].id`),
      accountId: str(x['accountId'], `holdings[${i}].accountId`),
      asset: {
        id: str(asset['id'], `holdings[${i}].asset.id`),
        symbol: str(asset['symbol'], `holdings[${i}].asset.symbol`),
        assetClass: str(
          asset['assetClass'],
          `holdings[${i}].asset.assetClass`,
        ) as Holding['asset']['assetClass'],
        liquidityTier: str(
          asset['liquidityTier'],
          `holdings[${i}].asset.liquidityTier`,
        ) as Holding['asset']['liquidityTier'],
        isStable: bool(asset['isStable'], `holdings[${i}].asset.isStable`),
        isYieldBearing: bool(asset['isYieldBearing'], `holdings[${i}].asset.isYieldBearing`),
      },
      quantity: dec(x['quantity'], `holdings[${i}].quantity`),
      priceMark: dec(x['priceMark'], `holdings[${i}].priceMark`),
    };
    const network = optStr(asset['network']);
    if (network !== undefined) holding.asset.network = network;
    if (asset['yieldApy'] !== undefined && asset['yieldApy'] !== null) {
      holding.asset.yieldApy = dec(asset['yieldApy'], `holdings[${i}].asset.yieldApy`);
    }
    if (asset['redemptionDelayDays'] !== undefined && asset['redemptionDelayDays'] !== null) {
      holding.asset.redemptionDelayDays = Number(asset['redemptionDelayDays']);
    }
    const priceSource = optStr(x['priceSource']);
    if (priceSource !== undefined) holding.priceSource = priceSource;
    return holding;
  });

  const liabilities: Liability[] = arr(o['liabilities'] ?? [], 'liabilities').map((l, i) => {
    const x = obj(l, `liabilities[${i}]`);
    const liability: Liability = {
      id: str(x['id'], `liabilities[${i}].id`),
      accountId: str(x['accountId'], `liabilities[${i}].accountId`),
      symbol: str(x['symbol'], `liabilities[${i}].symbol`),
      principal: dec(x['principal'], `liabilities[${i}].principal`),
      accruedInterest: dec(x['accruedInterest'] ?? 0, `liabilities[${i}].accruedInterest`),
      priceMark: dec(x['priceMark'], `liabilities[${i}].priceMark`),
      rateType: str(x['rateType'] ?? 'variable', `liabilities[${i}].rateType`) as RateType,
      currentApr: dec(x['currentApr'] ?? 0, `liabilities[${i}].currentApr`),
    };
    const venue = optStr(x['venue']);
    if (venue !== undefined) liability.venue = venue;
    return liability;
  });

  const collateralPositions = arr(o['collateralPositions'] ?? [], 'collateralPositions').map(
    (p, i) => {
      const x = obj(p, `collateralPositions[${i}]`);
      const pos: BalanceSheet['collateralPositions'][number] = {
        id: str(x['id'], `collateralPositions[${i}].id`),
        accountId: str(x['accountId'], `collateralPositions[${i}].accountId`),
        venue: str(x['venue'], `collateralPositions[${i}].venue`),
        collateral: arr(x['collateral'], `collateralPositions[${i}].collateral`).map((c, j) => {
          const y = obj(c, `collateralPositions[${i}].collateral[${j}]`);
          const params = obj(y['params'], `collateralPositions[${i}].collateral[${j}].params`);
          const parsed: CollateralParams = {
            ltv: dec(params['ltv'], 'ltv'),
            liquidationThreshold: dec(params['liquidationThreshold'], 'liquidationThreshold'),
            liquidationBonus: dec(params['liquidationBonus'] ?? 0, 'liquidationBonus'),
            eMode: bool(params['eMode'] ?? false, 'eMode'),
          };
          const cat = optStr(params['eModeCategory']);
          if (cat !== undefined) parsed.eModeCategory = cat;
          return {
            holdingId: str(y['holdingId'], 'holdingId'),
            params: parsed,
          };
        }),
        liabilityIds: arr(x['liabilityIds'] ?? [], 'liabilityIds').map((id) => String(id)),
      };
      const network = optStr(x['network']);
      if (network !== undefined) pos.network = network;
      return pos;
    },
  );

  const contingentObligations = arr(o['contingentObligations'] ?? [], 'contingentObligations').map(
    (c, i) => {
      const x = obj(c, `contingentObligations[${i}]`);
      const co: BalanceSheet['contingentObligations'][number] = {
        id: str(x['id'], `contingentObligations[${i}].id`),
        kind: str(
          x['kind'],
          `contingentObligations[${i}].kind`,
        ) as BalanceSheet['contingentObligations'][number]['kind'],
        amount: dec(x['amount'], `contingentObligations[${i}].amount`),
      };
      const accountId = optStr(x['accountId']);
      const dueOrTrigger = optStr(x['dueOrTrigger']);
      if (accountId !== undefined) co.accountId = accountId;
      if (dueOrTrigger !== undefined) co.dueOrTrigger = dueOrTrigger;
      return co;
    },
  );

  return {
    asOf: str(o['asOf'], 'asOf'),
    currency: str(o['currency'] ?? 'USD', 'currency'),
    accounts,
    holdings,
    liabilities,
    collateralPositions,
    contingentObligations,
  };
}

type RateType = Liability['rateType'];

export type { GovernorSnapshot };

export function hydrateGovernorSnapshot(raw: unknown): GovernorSnapshot {
  const o = obj(raw, 'governor snapshot');
  const hf = o['healthFactor'];
  return {
    asOf: str(o['asOf'] ?? new Date().toISOString(), 'asOf'),
    navUsd: dec(o['navUsd'] ?? o['nav'], 'navUsd'),
    equityUsd: dec(o['equityUsd'] ?? o['equity'], 'equityUsd'),
    debtUsd: dec(o['debtUsd'] ?? o['debt'] ?? 0, 'debtUsd'),
    grossAssetsUsd: dec(
      o['grossAssetsUsd'] ?? o['assets'] ?? o['navUsd'] ?? o['nav'],
      'grossAssetsUsd',
    ),
    reserveHeldUsd: dec(o['reserveHeldUsd'] ?? o['reserves'] ?? 0, 'reserveHeldUsd'),
    reserveRequiredUsd: dec(
      o['reserveRequiredUsd'] ?? o['reserveRequired'] ?? 0,
      'reserveRequiredUsd',
    ),
    healthFactor: hf === null || hf === undefined || hf === 'n/a' ? null : dec(hf, 'healthFactor'),
    correlated: o['correlated'] === true || o['eMode'] === true,
    smallPosition: o['smallPosition'] === true,
    drawdown: dec(o['drawdown'] ?? 0, 'drawdown'),
    dailyPnl: dec(o['dailyPnl'] ?? 0, 'dailyPnl'),
    hurdle: dec(o['hurdle'] ?? '0.10', 'hurdle'),
    netCarry:
      o['netCarry'] === null || o['netCarry'] === undefined ? null : dec(o['netCarry'], 'netCarry'),
  };
}

export function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function loadDisclosureFile(path: string): DisclosureProfile {
  return parseDisclosureProfile(readJsonFile(path));
}

export function looksLikeBalanceSheet(raw: unknown): boolean {
  if (raw === null || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return Array.isArray(o['holdings']) && Array.isArray(o['accounts']);
}
