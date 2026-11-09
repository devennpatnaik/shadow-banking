import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { d, ZERO, type Decimal } from '@shadow-banking/core';
import { aaveMarket } from './defaults.js';
import type { CostInput, SimulationInput, TxAction } from './types.js';
import { TX_ACTIONS } from './types.js';

/**
 * External parameter file schema. Matches `docs/data/market-snapshot-<date>.json`
 * (assets[], markets[], costs{gas, swap, bridging, fiatRamp, hyperliquid}, hurdle).
 *
 * The file is produced by another worker; this loader is the contract. Extra fields are
 * ignored. `null` means "not captured", not zero.
 */

const num = z.number().finite();
const numNull = z.number().finite().nullable();
const str = z.string();

const EModeSchema = z
  .object({
    category: str,
    ltv: num,
    liquidationThreshold: num,
    liquidationBonus: num,
    collateral: z.boolean().optional(),
    borrowable: z.boolean().optional(),
  })
  .passthrough();

const AssetSchema = z
  .object({
    symbol: str,
    network: str.optional(),
    priceUsd: numNull.optional(),
    yieldApy: numNull.optional(),
    source: str.optional(),
    asOf: str.optional(),
    notes: str.optional(),
  })
  .passthrough();

const MarketSchema = z
  .object({
    protocol: str,
    network: str,
    asset: str,
    supplyApy: numNull.optional(),
    borrowApy: numNull.optional(),
    ltv: numNull.optional(),
    liquidationThreshold: numNull.optional(),
    liquidationBonus: numNull.optional(),
    eMode: EModeSchema.nullable().optional(),
    source: str.optional(),
    asOf: str.optional(),
    notes: str.optional(),
  })
  .passthrough();

const ActionCostSchema = z
  .object({
    gasUnits: num.optional(),
    usdAtPlanning: num.optional(),
    usdAtSpot: num.optional(),
    observedRange: z.tuple([num, num]).optional(),
  })
  .passthrough();

const NetworkGasSchema = z
  .object({
    ethPriceUsd: num.optional(),
    gasPriceGwei: z
      .object({
        planning: num.optional(),
        spot: num.optional(),
      })
      .passthrough()
      .optional(),
    actions: z.record(str, ActionCostSchema).optional(),
    source: str.optional(),
    notes: str.optional(),
  })
  .passthrough();

const SwapPairSchema = z
  .object({
    feeRate: num.optional(),
    priceImpactAt100: num.optional(),
    priceImpactAt1000: num.optional(),
    source: str.optional(),
    notes: str.optional(),
  })
  .passthrough();

const BridgeLegSchema = z
  .object({
    protocolFeeRate: num.optional(),
    fixedUsd: num.optional(),
  })
  .passthrough();

export const MarketSnapshotFileSchema = z
  .object({
    schemaVersion: z.number().int().positive().optional(),
    snapshotDate: str,
    currency: str.optional(),
    hurdle: num.optional(),
    assets: z.array(AssetSchema),
    markets: z.array(MarketSchema),
    costs: z
      .object({
        gas: z.record(str, NetworkGasSchema).optional(),
        swap: z.record(str, SwapPairSchema).optional(),
        bridging: z.record(str, BridgeLegSchema).optional(),
        fiatRamp: z.unknown().optional(),
        hyperliquid: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type MarketSnapshotFile = z.infer<typeof MarketSnapshotFileSchema>;

export function parseMarketSnapshot(raw: unknown): MarketSnapshotFile {
  return MarketSnapshotFileSchema.parse(raw);
}

export function loadMarketSnapshotFile(path: string): MarketSnapshotFile {
  const text = readFileSync(path, 'utf8');
  return parseMarketSnapshot(JSON.parse(text) as unknown);
}

export interface ResolveFromSnapshotArgs {
  snapshot: MarketSnapshotFile;
  network: string;
  collateralSymbol: string;
  borrowSymbol: string;
  seedUsd: Decimal;
  reserveRate: Decimal;
  reserveYieldApy?: Decimal;
  horizonDays?: number;
  useEMode?: boolean;
  includeUnwindCosts?: boolean;
}

const ASSET_ALIASES: Record<string, string[]> = {
  weth: ['ETH', 'WETH'],
  eth: ['ETH', 'WETH'],
  wsteth: ['wstETH', 'stETH'],
  steth: ['stETH', 'wstETH'],
};

function findAsset(snapshot: MarketSnapshotFile, symbol: string, network?: string) {
  const candidates = ASSET_ALIASES[symbol.toLowerCase()] ?? [symbol];
  for (const cand of candidates) {
    const norm = cand.toLowerCase();
    const matches = snapshot.assets.filter((a) => a.symbol.toLowerCase() === norm);
    const onNet = network
      ? matches.filter((a) => (a.network ?? '').toLowerCase() === network.toLowerCase())
      : [];
    if (onNet[0]) return onNet[0];
    if (matches[0]) return matches[0];
  }
  return undefined;
}

function findMarket(snapshot: MarketSnapshotFile, symbol: string, network: string) {
  const norm = symbol.toLowerCase();
  return snapshot.markets.find(
    (m) => m.network.toLowerCase() === network.toLowerCase() && m.asset.toLowerCase() === norm,
  );
}

function actionUsd(net: z.infer<typeof NetworkGasSchema> | undefined, action: TxAction): Decimal {
  const row = net?.actions?.[action];
  if (row?.usdAtPlanning !== undefined) return d(row.usdAtPlanning);
  if (
    row?.gasUnits !== undefined &&
    net?.gasPriceGwei?.planning !== undefined &&
    net.ethPriceUsd !== undefined
  ) {
    return d(row.gasUnits).mul(net.gasPriceGwei.planning).mul('1e-9').mul(net.ethPriceUsd);
  }
  return ZERO;
}

export function costsFromSnapshot(
  snapshot: MarketSnapshotFile,
  network: string,
  collateralSymbol: string,
  borrowSymbol: string,
  seedUsd: Decimal,
): CostInput {
  const gas = snapshot.costs?.gas?.[network];
  const gasUsdPerAction = Object.fromEntries(
    TX_ACTIONS.map((a) => [a, actionUsd(gas, a)]),
  ) as Record<TxAction, Decimal>;
  const pairKeys = [
    `${collateralSymbol}/${borrowSymbol}`,
    `${borrowSymbol}/${collateralSymbol}`,
    'wstETH/ETH',
    'USDC/ETH',
  ];
  const swap = pairKeys.map((k) => snapshot.costs?.swap?.[k]).find((s) => s !== undefined);
  const impact = seedUsd.gte(500)
    ? (swap?.priceImpactAt1000 ?? swap?.priceImpactAt100)
    : swap?.priceImpactAt100;
  const bridging = snapshot.costs?.bridging?.ethereumToL2;
  const planning = gas?.gasPriceGwei?.planning;
  return {
    network,
    gasUsdPerAction,
    swapFeeRate: d(swap?.feeRate ?? 0),
    slippageRate: d(impact ?? 0),
    bridgingFixedUsd: ZERO,
    bridgingRate: d(bridging?.protocolFeeRate ?? 0).eq(0) ? ZERO : ZERO,
    gasBasisLabel:
      planning !== undefined
        ? `${network} planning gas ${planning} gwei (snapshot ${snapshot.snapshotDate})`
        : `${network} usdAtPlanning (snapshot ${snapshot.snapshotDate})`,
  };
}

/**
 * Build a SimulationInput from a snapshot file. Collateral LTV/LT/bonus come from the
 * collateral market's E-mode when `useEMode` is true and E-mode lists the asset as collateral.
 */
export function simulationInputFromSnapshot(args: ResolveFromSnapshotArgs): SimulationInput {
  const { snapshot, network, collateralSymbol, borrowSymbol, seedUsd } = args;
  const useEMode = args.useEMode !== false;
  const collAsset = findAsset(snapshot, collateralSymbol, network);
  const borrowAsset =
    findAsset(snapshot, borrowSymbol, network) ?? findAsset(snapshot, borrowSymbol);
  const collMarket = findMarket(snapshot, collateralSymbol, network);
  const borrowMarket = findMarket(snapshot, borrowSymbol, network);
  if (!collAsset) throw new Error(`snapshot has no asset ${collateralSymbol}`);
  if (!borrowAsset) throw new Error(`snapshot has no asset ${borrowSymbol}`);
  if (!collMarket) throw new Error(`snapshot has no market ${collateralSymbol} on ${network}`);
  if (!borrowMarket) throw new Error(`snapshot has no market ${borrowSymbol} on ${network}`);
  if (collAsset.priceUsd == null)
    throw new Error(`${collateralSymbol} priceUsd is null in snapshot`);
  if (borrowAsset.priceUsd == null && borrowAsset.yieldApy == null) {
    /* price can be missing for the borrow asset if we borrow ETH and have ETH in assets */
  }
  const borrowPrice = borrowAsset.priceUsd ?? findAsset(snapshot, 'ETH')?.priceUsd;
  if (borrowPrice == null) throw new Error(`${borrowSymbol} priceUsd is null in snapshot`);
  const eMode = useEMode ? collMarket.eMode : null;
  if (useEMode && !eMode)
    throw new Error(`no E-mode parameters for ${collateralSymbol} on ${network}`);
  const ltv = eMode?.ltv ?? collMarket.ltv;
  const lt = eMode?.liquidationThreshold ?? collMarket.liquidationThreshold;
  const bonus = eMode?.liquidationBonus ?? collMarket.liquidationBonus;
  if (ltv == null || lt == null || bonus == null) {
    throw new Error(`missing LTV/LT/bonus for ${collateralSymbol} on ${network}`);
  }
  const borrowApy = borrowMarket.borrowApy;
  if (borrowApy == null) throw new Error(`missing borrowApy for ${borrowSymbol} on ${network}`);
  const yieldApy = collAsset.yieldApy;
  if (yieldApy == null) throw new Error(`missing yieldApy for ${collateralSymbol}`);
  const usdc = findAsset(snapshot, 'USDC', network) ?? findAsset(snapshot, 'USDC');
  const reserveYield = args.reserveYieldApy ?? (usdc?.yieldApy != null ? d(usdc.yieldApy) : ZERO);
  const costs = costsFromSnapshot(snapshot, network, collateralSymbol, borrowSymbol, seedUsd);
  return {
    label: `${collMarket.protocol} ${collateralSymbol}/${borrowSymbol}${useEMode ? ' E-mode' : ''} on ${network} (${snapshot.snapshotDate})`,
    snapshotDate: snapshot.snapshotDate,
    seedUsd,
    reserveRate: args.reserveRate,
    reserveYieldApy: reserveYield,
    horizonDays: args.horizonDays ?? 365,
    collateral: {
      symbol: collAsset.symbol,
      priceUsd: d(collAsset.priceUsd),
      yieldApy: d(yieldApy),
      volatility: d('0.08'),
    },
    borrow: {
      symbol: borrowAsset.symbol,
      priceUsd: d(borrowPrice),
      variableBorrowApy: d(borrowApy),
    },
    market: aaveMarket({
      protocol: collMarket.protocol,
      network,
      ltv,
      liquidationThreshold: lt,
      liquidationBonus: bonus,
      eMode: Boolean(eMode),
      ...(eMode?.category ? { eModeCategory: eMode.category } : {}),
    }),
    costs,
    policy: { kind: 'optimal' },
    stopping: {
      hurdleApy: d(snapshot.hurdle ?? 0.1),
      minHealthFactor: d('1.25'),
      postActionHfBuffer: d('0.05'),
      smallPositionHfBuffer: d('0.10'),
      minPriceDropToLiquidation: d('0.08'),
      maxLiquidationProbability: d('0.20'),
      maxLeverage: d('3'),
      maxLoops: 8,
      marginalNetIncomeFloorUsd: d('0'),
      minBorrowUsd: d('5'),
    },
    includeUnwindCosts: args.includeUnwindCosts !== false,
    notes: [
      `Parameters loaded from an external snapshot dated ${snapshot.snapshotDate}. They are point-in-time estimates, not realized figures.`,
      `Collateral yield ${collAsset.source ?? 'snapshot'}; borrow rate ${borrowMarket.source ?? 'snapshot'}.`,
    ],
  };
}
