import { d, ZERO, type Decimal } from '@shadow-banking/core';
import {
  loadMarketSnapshotFile,
  parseMarketSnapshot,
  type MarketSnapshotFile,
} from '@shadow-banking/simulator';
import { z } from 'zod';
import type { FundingBasis, HyperliquidParams, ResolvedMarket } from './types.js';

const num = z.number().finite();

const HyperliquidFileSchema = z
  .object({
    takerFeeRate: num.optional(),
    makerFeeRate: num.optional(),
    minOrderNotionalUsd: num.optional(),
    minDepositUsdc: num.optional(),
    withdrawalFeeUsdc: num.optional(),
    ethMaxLeverage: num.optional(),
    ethMaintenanceMarginRate: num.optional(),
    funding: z
      .object({
        ETH: z
          .object({
            currentApr: num.optional(),
            avg30dApr: num.optional(),
            planningApr: num.optional(),
            stressApr: num.optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

function findAsset(snapshot: MarketSnapshotFile, symbol: string, network?: string) {
  const matches = snapshot.assets.filter((a) => a.symbol.toLowerCase() === symbol.toLowerCase());
  if (network) {
    const onNet = matches.find((a) => (a.network ?? '').toLowerCase() === network.toLowerCase());
    if (onNet) return onNet;
  }
  return matches[0];
}

function findMarket(snapshot: MarketSnapshotFile, symbol: string, network: string) {
  return snapshot.markets.find(
    (m) =>
      m.network.toLowerCase() === network.toLowerCase() &&
      m.asset.toLowerCase() === symbol.toLowerCase(),
  );
}

function bestUsdcSupply(snapshot: MarketSnapshotFile): {
  apy: Decimal;
  network: string;
  protocol: string;
} {
  const usdcMarkets = snapshot.markets.filter(
    (m) => m.asset.toLowerCase() === 'usdc' && m.supplyApy != null,
  );
  if (usdcMarkets.length === 0) {
    const asset = findAsset(snapshot, 'USDC');
    if (asset?.yieldApy != null) {
      return { apy: d(asset.yieldApy), network: asset.network ?? 'base', protocol: 'aave-v3' };
    }
    return { apy: ZERO, network: 'base', protocol: 'aave-v3' };
  }
  const best = usdcMarkets.reduce((a, b) => ((a.supplyApy ?? 0) >= (b.supplyApy ?? 0) ? a : b));
  return { apy: d(best.supplyApy ?? 0), network: best.network, protocol: best.protocol };
}

function swapPair(snapshot: MarketSnapshotFile, key: string, seedUsd: Decimal) {
  const row = snapshot.costs?.swap?.[key];
  const impact = seedUsd.gte(500)
    ? (row?.priceImpactAt1000 ?? row?.priceImpactAt100)
    : row?.priceImpactAt100;
  return { fee: d(row?.feeRate ?? 0), impact: d(impact ?? 0) };
}

function hyperliquidFromSnapshot(
  snapshot: MarketSnapshotFile,
  fundingBasis: FundingBasis,
): HyperliquidParams {
  const raw = HyperliquidFileSchema.parse(snapshot.costs?.hyperliquid ?? {});
  const eth = raw.funding?.ETH ?? {};
  const byBasis: Record<FundingBasis, number | undefined> = {
    avg30d: eth.avg30dApr,
    planning: eth.planningApr,
    current: eth.currentApr,
    stress: eth.stressApr,
  };
  const fundingApr = d(byBasis[fundingBasis] ?? eth.avg30dApr ?? 0);
  return {
    takerFeeRate: d(raw.takerFeeRate ?? 0),
    makerFeeRate: d(raw.makerFeeRate ?? 0),
    minOrderNotionalUsd: d(raw.minOrderNotionalUsd ?? 10),
    minDepositUsdc: d(raw.minDepositUsdc ?? 5),
    withdrawalFeeUsdc: d(raw.withdrawalFeeUsdc ?? 1),
    ethMaxLeverage: d(raw.ethMaxLeverage ?? 25),
    ethMaintenanceMarginRate: d(raw.ethMaintenanceMarginRate ?? 0.02),
    governorMaxVenueLeverage: d(2),
    fundingApr,
    fundingCurrentApr: d(eth.currentApr ?? 0),
    fundingPlanningApr: d(eth.planningApr ?? 0),
    fundingStressApr: d(eth.stressApr ?? 0),
  };
}

export interface ResolveMarketArgs {
  snapshot: MarketSnapshotFile;
  network?: string;
  lstSymbol?: string;
  borrowSymbol?: string;
  seedUsd?: Decimal;
  fundingBasis?: FundingBasis;
  lpFeeApr?: Decimal;
  lpLvrApr?: Decimal;
  hurdleApy?: Decimal;
}

export function resolveMarket(args: ResolveMarketArgs): ResolvedMarket {
  const snapshot = args.snapshot;
  const network = args.network ?? 'ethereum';
  const lstSymbol = args.lstSymbol ?? 'wstETH';
  const borrowSymbol = args.borrowSymbol ?? 'WETH';
  const seedUsd = args.seedUsd ?? d(1000);
  const collAsset = findAsset(snapshot, lstSymbol, network) ?? findAsset(snapshot, lstSymbol);
  const collMarket = findMarket(snapshot, lstSymbol, network);
  const borrowMarket = findMarket(snapshot, borrowSymbol, network);
  if (!collAsset) throw new Error(`snapshot has no asset ${lstSymbol}`);
  if (!collMarket) throw new Error(`snapshot has no market ${lstSymbol} on ${network}`);
  if (!borrowMarket) throw new Error(`snapshot has no market ${borrowSymbol} on ${network}`);
  if (collAsset.yieldApy == null) throw new Error(`missing yieldApy for ${lstSymbol}`);
  if (collAsset.priceUsd == null) throw new Error(`missing priceUsd for ${lstSymbol}`);
  if (borrowMarket.borrowApy == null)
    throw new Error(`missing borrowApy for ${borrowSymbol} on ${network}`);
  const eMode = collMarket.eMode;
  const ltv = eMode?.ltv ?? collMarket.ltv;
  const lt = eMode?.liquidationThreshold ?? collMarket.liquidationThreshold;
  const bonus = eMode?.liquidationBonus ?? collMarket.liquidationBonus;
  if (ltv == null || lt == null || bonus == null) {
    throw new Error(`missing LTV/LT/bonus for ${lstSymbol} on ${network}`);
  }
  const usdc = bestUsdcSupply(snapshot);
  const wst = swapPair(snapshot, 'wstETH/ETH', seedUsd);
  const usdcEth = swapPair(snapshot, 'USDC/ETH', seedUsd);
  return {
    snapshot,
    snapshotDate: snapshot.snapshotDate,
    hurdleApy: args.hurdleApy ?? d(snapshot.hurdle ?? 0.1),
    lstSymbol: collAsset.symbol,
    lstYieldApy: d(collAsset.yieldApy),
    lstPriceUsd: d(collAsset.priceUsd),
    borrowSymbol,
    borrowApy: d(borrowMarket.borrowApy),
    network,
    protocol: collMarket.protocol,
    ltv: d(ltv),
    liquidationThreshold: d(lt),
    liquidationBonus: d(bonus),
    eMode: Boolean(eMode),
    ...(eMode?.category ? { eModeCategory: eMode.category } : {}),
    usdcSupplyApy: usdc.apy,
    usdcNetwork: usdc.network,
    usdcProtocol: usdc.protocol,
    swapFeeWstEth: wst.fee,
    swapImpactWstEth: wst.impact,
    swapFeeUsdcEth: usdcEth.fee,
    swapImpactUsdcEth: usdcEth.impact,
    hyperliquid: hyperliquidFromSnapshot(snapshot, args.fundingBasis ?? 'avg30d'),
    lpFeeApr: args.lpFeeApr ?? d('0.013'),
    lpLvrApr: args.lpLvrApr ?? d('0.001'),
  };
}

export function loadSnapshot(path: string): MarketSnapshotFile {
  return loadMarketSnapshotFile(path);
}

export function parseSnapshot(raw: unknown): MarketSnapshotFile {
  return parseMarketSnapshot(raw);
}
