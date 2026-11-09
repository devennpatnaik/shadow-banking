import {
  balanceSheetReport,
  d,
  deployableCapital,
  holdingValue,
  requiredLiquidityReserve,
  type BalanceSheet,
  type Decimal,
  type DisclosureProfile,
} from '@shadow-banking/core';
import { DEFAULT_ENVELOPE, DEFAULT_HURDLE, SMALL_POSITION_USD } from './config.js';
import type { ConcentrationShares, DataQuality, PositionRisk, RiskObservation } from './types.js';

export interface ObservationExtras {
  drawdown?: Decimal;
  dailyPnl?: Decimal;
  hurdle?: Decimal;
  netCarry?: Decimal | null;
  netCarryHours?: Decimal | null;
  lstDiscount?: Decimal | null;
  ldHedge?: Decimal | null;
  marginRatio?: Decimal | null;
  netDelta?: Decimal | null;
  netDeltaHours?: Decimal | null;
  netDirectional?: Decimal | null;
  borrowUtilization?: Decimal | null;
  assetYield?: Decimal | null;
  borrowApr?: Decimal | null;
  funding7d?: Decimal | null;
  stablecoinPegDeviation?: Decimal | null;
  oracleDivergence?: Decimal | null;
  sequencerDownHours?: Decimal | null;
  withdrawalLiquidityMultiple?: Decimal | null;
  reserveFrozen?: boolean;
  envelopeUsd?: Decimal;
  dataQuality?: DataQuality;
  reserveRequiredUsd?: Decimal;
}

const ETH_FAMILY = /^(w?steth|weth|eth)$/i;

function assetFamily(symbol: string): string {
  if (ETH_FAMILY.test(symbol)) return 'ETH';
  return symbol.toUpperCase();
}

function maxShare(
  amounts: Map<string, Decimal>,
  gross: Decimal,
): { id: string | null; share: Decimal | null } {
  if (gross.lte(0) || amounts.size === 0) return { id: null, share: null };
  let bestId: string | null = null;
  let best = d(0);
  for (const [id, v] of amounts) {
    if (v.gt(best)) {
      best = v;
      bestId = id;
    }
  }
  return { id: bestId, share: best.div(gross) };
}

export function concentrationFromBook(book: BalanceSheet): ConcentrationShares {
  const gross = book.holdings.reduce((s, h) => s.plus(holdingValue(h)), d(0));
  const protocol = new Map<string, Decimal>();
  const network = new Map<string, Decimal>();
  const asset = new Map<string, Decimal>();
  const accounts = new Map(book.accounts.map((a) => [a.id, a]));

  for (const h of book.holdings) {
    const v = holdingValue(h);
    const acct = accounts.get(h.accountId);
    const proto = acct?.institution ?? 'unknown';
    protocol.set(proto, (protocol.get(proto) ?? d(0)).plus(v));
    const net = h.asset.network ?? acct?.network ?? 'unknown';
    network.set(net, (network.get(net) ?? d(0)).plus(v));
    if (!h.asset.isStable) {
      const fam = assetFamily(h.asset.symbol);
      asset.set(fam, (asset.get(fam) ?? d(0)).plus(v));
    }
  }

  const p = maxShare(protocol, gross);
  const n = maxShare(network, gross);
  const a = maxShare(asset, gross);
  return {
    protocolMaxShare: p.share,
    protocolId: p.id,
    networkMaxShare: n.share,
    networkId: n.id,
    nonStableAssetMaxShare: a.share,
    nonStableAssetId: a.id,
  };
}

function directionalFromBook(book: BalanceSheet, nav: Decimal): Decimal | null {
  if (nav.lte(0)) return d(0);
  const accounts = new Map(book.accounts.map((a) => [a.id, a]));
  const long = new Map<string, Decimal>();
  const debt = new Map<string, Decimal>();
  for (const h of book.holdings) {
    if (h.asset.isStable) continue;
    const fam = assetFamily(h.asset.symbol);
    long.set(fam, (long.get(fam) ?? d(0)).plus(holdingValue(h)));
  }
  for (const l of book.liabilities) {
    const fam = assetFamily(l.symbol);
    const v = l.principal.plus(l.accruedInterest).mul(l.priceMark);
    debt.set(fam, (debt.get(fam) ?? d(0)).plus(v));
  }
  void accounts;
  let net = d(0);
  const keys = new Set([...long.keys(), ...debt.keys()]);
  for (const k of keys) {
    net = net.plus((long.get(k) ?? d(0)).minus(debt.get(k) ?? d(0)));
  }
  return net.div(nav);
}

export function observationFromBook(
  book: BalanceSheet,
  disclosure: DisclosureProfile,
  extras: ObservationExtras = {},
): RiskObservation {
  const reportBare = balanceSheetReport(book);
  const dep = deployableCapital(disclosure, reportBare.reserveHeld);
  const req =
    extras.reserveRequiredUsd ?? requiredLiquidityReserve(disclosure, dep.deployable).total;
  const report = balanceSheetReport(book, { reserveRequired: req });
  const positions: PositionRisk[] = report.positions.map((p) => {
    const small =
      p.debt.gt(0) && (p.collateralValue.lt(SMALL_POSITION_USD) || p.debt.lt(SMALL_POSITION_USD));
    return {
      positionId: p.positionId,
      venue: p.venue,
      network: p.network,
      correlated: p.eMode,
      smallPosition: small,
      healthFactor: p.healthFactor,
      liquidationDistance: p.liquidationDistance,
      ltv: p.capacity.currentLtv,
      collateralUsd: p.collateralValue,
      debtUsd: p.debt,
    };
  });
  const correlated = positions.some((p) => p.correlated);
  const smallPosition = positions.some((p) => p.smallPosition);
  const leverage =
    report.equity.gt(0) && report.totalAssets.gt(0)
      ? report.totalAssets.div(report.equity)
      : report.totalLiabilities.gt(0)
        ? null
        : d(1);
  const collateral = positions.reduce((s, p) => s.plus(p.collateralUsd), d(0));
  const ltv = collateral.gt(0) ? report.totalLiabilities.div(collateral) : null;
  const worstLd = positions
    .map((p) => p.liquidationDistance)
    .filter((x): x is Decimal => x !== null)
    .reduce<Decimal | null>((a, b) => (a === null || b.lt(a) ? b : a), null);

  return {
    asOf: book.asOf,
    navUsd: report.equity,
    equityUsd: report.equity,
    debtUsd: report.totalLiabilities,
    grossAssetsUsd: report.totalAssets,
    reserveHeldUsd: report.reserveHeld,
    reserveRequiredUsd: req,
    healthFactor: report.worstHealthFactor,
    liquidationDistance: worstLd,
    ltv,
    leverage,
    correlated,
    smallPosition,
    drawdown: extras.drawdown ?? d(0),
    dailyPnl: extras.dailyPnl ?? d(0),
    hurdle: extras.hurdle ?? DEFAULT_HURDLE,
    netCarry: extras.netCarry ?? null,
    netCarryHours: extras.netCarryHours ?? null,
    lstDiscount: extras.lstDiscount ?? null,
    ldHedge: extras.ldHedge ?? null,
    marginRatio: extras.marginRatio ?? null,
    netDelta: extras.netDelta ?? null,
    netDeltaHours: extras.netDeltaHours ?? null,
    netDirectional: extras.netDirectional ?? directionalFromBook(book, report.equity),
    borrowUtilization: extras.borrowUtilization ?? null,
    assetYield: extras.assetYield ?? null,
    borrowApr: extras.borrowApr ?? null,
    funding7d: extras.funding7d ?? null,
    stablecoinPegDeviation: extras.stablecoinPegDeviation ?? null,
    oracleDivergence: extras.oracleDivergence ?? null,
    sequencerDownHours: extras.sequencerDownHours ?? null,
    withdrawalLiquidityMultiple: extras.withdrawalLiquidityMultiple ?? null,
    reserveFrozen: extras.reserveFrozen ?? false,
    concentration: concentrationFromBook(book),
    envelopeUsd: extras.envelopeUsd ?? DEFAULT_ENVELOPE,
    dataQuality: extras.dataQuality ?? 'fresh',
    positions,
  };
}

/** Flat governor snapshot (CLI `--snapshot`) used by tests and stressed fixtures. */
export interface FlatSnapshot {
  asOf: string;
  navUsd: Decimal;
  equityUsd: Decimal;
  debtUsd: Decimal;
  grossAssetsUsd: Decimal;
  reserveHeldUsd: Decimal;
  reserveRequiredUsd: Decimal;
  healthFactor: Decimal | null;
  correlated: boolean;
  smallPosition: boolean;
  drawdown: Decimal;
  dailyPnl: Decimal;
  hurdle: Decimal;
  netCarry: Decimal | null;
}

export function observationFromFlat(snap: FlatSnapshot): RiskObservation {
  const leverage =
    snap.equityUsd.gt(0) && snap.grossAssetsUsd.gt(0)
      ? snap.grossAssetsUsd.div(snap.equityUsd)
      : snap.debtUsd.gt(0)
        ? null
        : d(1);
  const hf = snap.healthFactor;
  const ld = hf !== null && hf.gt(0) ? d(1).minus(d(1).div(hf)) : null;
  const ltv =
    snap.grossAssetsUsd.gt(0) && snap.debtUsd.gt(0)
      ? snap.debtUsd.div(snap.grossAssetsUsd)
      : snap.debtUsd.gt(0)
        ? null
        : d(0);
  return {
    asOf: snap.asOf,
    navUsd: snap.navUsd,
    equityUsd: snap.equityUsd,
    debtUsd: snap.debtUsd,
    grossAssetsUsd: snap.grossAssetsUsd,
    reserveHeldUsd: snap.reserveHeldUsd,
    reserveRequiredUsd: snap.reserveRequiredUsd,
    healthFactor: hf,
    liquidationDistance: ld !== null && ld.gte(0) ? ld : ld !== null ? d(0) : null,
    ltv,
    leverage,
    correlated: snap.correlated,
    smallPosition: snap.smallPosition,
    drawdown: snap.drawdown,
    dailyPnl: snap.dailyPnl,
    hurdle: snap.hurdle,
    netCarry: snap.netCarry,
    netCarryHours: null,
    lstDiscount: null,
    ldHedge: null,
    marginRatio: null,
    netDelta: null,
    netDeltaHours: null,
    netDirectional: null,
    borrowUtilization: null,
    assetYield: null,
    borrowApr: null,
    funding7d: null,
    stablecoinPegDeviation: null,
    oracleDivergence: null,
    sequencerDownHours: null,
    withdrawalLiquidityMultiple: null,
    reserveFrozen: false,
    concentration: {
      protocolMaxShare: null,
      protocolId: null,
      networkMaxShare: null,
      networkId: null,
      nonStableAssetMaxShare: null,
      nonStableAssetId: null,
    },
    envelopeUsd: DEFAULT_ENVELOPE,
    dataQuality: 'fresh',
    positions: [],
  };
}
