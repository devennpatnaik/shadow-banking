import { DAYS_PER_YEAR, d, ONE, ZERO, max0, type Decimal } from '@shadow-banking/core';
import { aaveMarket, assessRisk, correlatedStoppingRule } from '@shadow-banking/simulator';
import type { ResolvedMarket, RiskMeasures, YieldStack } from './types.js';

export function years(horizonDays: number): Decimal {
  return d(horizonDays).div(DAYS_PER_YEAR);
}

export function amortize(oneOffUsd: Decimal, horizonDays: number): Decimal {
  const y = years(horizonDays);
  return y.gt(0) ? oneOffUsd.div(y) : oneOffUsd;
}

export const REALIZED_UNAVAILABLE: YieldStack['realized'] = {
  capable: false,
  incomeUsd: null,
  apy: null,
  reason:
    'Realized net yield is produced by the accounting ledger (a separate deliverable). This engine reports gross and estimated net only.',
};

export function yieldStack(args: {
  equityUsd: Decimal;
  grossIncomeUsd: Decimal;
  financingUsd: Decimal;
  executionUsd: Decimal;
  expectedLossUsd: Decimal;
}): YieldStack {
  const { equityUsd, grossIncomeUsd, financingUsd, executionUsd, expectedLossUsd } = args;
  const estimatedNetUsd = grossIncomeUsd
    .minus(financingUsd)
    .minus(executionUsd)
    .minus(expectedLossUsd);
  const apy = (usd: Decimal) => (equityUsd.gt(0) ? usd.div(equityUsd) : ZERO);
  return {
    grossIncomeUsd,
    grossApy: apy(grossIncomeUsd),
    financingUsd,
    executionUsd,
    expectedLossUsd,
    estimatedNetUsd,
    estimatedNetApy: apy(estimatedNetUsd),
    realized: REALIZED_UNAVAILABLE,
  };
}

/** Cheap USDC rails: on-chain swap drag both ways (fiat ACH/USDC is free in the snapshot). */
export function cheapRampRoundTripUsd(notional: Decimal, market: ResolvedMarket): Decimal {
  const usdcEth = market.swapFeeUsdcEth.plus(market.swapImpactUsdcEth);
  const lst = market.swapFeeWstEth.plus(market.swapImpactWstEth);
  return notional.mul(usdcEth.plus(lst)).mul(2);
}

export function loopRisk(args: {
  market: ResolvedMarket;
  collateralUsd: Decimal;
  debtUsd: Decimal;
  horizonDays: number;
  maxLeverage: Decimal;
}): RiskMeasures {
  const equityUsd = args.collateralUsd.minus(args.debtUsd);
  const simMarket = aaveMarket({
    protocol: args.market.protocol,
    network: args.market.network,
    ltv: args.market.ltv.toString(),
    liquidationThreshold: args.market.liquidationThreshold.toString(),
    liquidationBonus: args.market.liquidationBonus.toString(),
    eMode: args.market.eMode,
    ...(args.market.eModeCategory ? { eModeCategory: args.market.eModeCategory } : {}),
  });
  const rule = {
    ...correlatedStoppingRule(),
    maxLeverage: args.maxLeverage,
  };
  const assessed = assessRisk({
    market: simMarket,
    rule,
    collateralUsd: args.collateralUsd,
    debtUsd: args.debtUsd,
    equityUsd,
    volatility: d('0.08'),
    horizonYears: years(args.horizonDays),
  });
  const leverage = equityUsd.gt(0) ? args.collateralUsd.div(equityUsd) : ZERO;
  const ltv = args.collateralUsd.gt(0) ? args.debtUsd.div(args.collateralUsd) : null;
  const breaches = [...assessed.breaches];
  if (leverage.gt(args.maxLeverage)) {
    const msg = `leverage ${leverage.toFixed(2)}x above governor cap ${args.maxLeverage.toFixed(2)}x`;
    if (!breaches.includes(msg)) breaches.push(msg);
  }
  return {
    healthFactor: assessed.healthFactor,
    liquidationDistance: assessed.priceDropToLiquidation,
    hedgeLiquidationDistance: null,
    leverage,
    ltv,
    directionalExposure: ONE,
    concentration: {
      byAsset: args.market.lstSymbol,
      byProtocol: args.market.protocol,
      byNetwork: args.market.network,
      assetShare: ONE,
      protocolShare: ONE,
    },
    smallPosition: assessed.smallPosition,
    fullyLiquidatableInOneCall: assessed.fullyLiquidatableInOneCall,
    expectedLiquidationLossUsd: assessed.expectedLiquidationLossUsd,
    breaches,
    withinGovernorLimits: breaches.length === 0,
  };
}

export function unleveredRisk(args: {
  asset: string;
  protocol: string;
  network: string;
  directionalExposure: Decimal;
}): RiskMeasures {
  return {
    healthFactor: null,
    liquidationDistance: null,
    hedgeLiquidationDistance: null,
    leverage: ONE,
    ltv: null,
    directionalExposure: args.directionalExposure,
    concentration: {
      byAsset: args.asset,
      byProtocol: args.protocol,
      byNetwork: args.network,
      assetShare: ONE,
      protocolShare: ONE,
    },
    smallPosition: false,
    fullyLiquidatableInOneCall: false,
    expectedLiquidationLossUsd: ZERO,
    breaches: [],
    withinGovernorLimits: true,
  };
}

/**
 * Risk-adjusted APY: estimated net on deployable capital, divided by a risk unit that
 * grows with leverage, unhedged directional exposure, and tightness of liquidation distance.
 */
export function riskAdjustedApy(portfolioNetApy: Decimal, risk: RiskMeasures): Decimal {
  let units = ONE;
  if (risk.leverage.gt(ONE)) units = units.plus(risk.leverage.minus(ONE));
  units = units.plus(risk.directionalExposure);
  if (
    risk.liquidationDistance !== null &&
    risk.liquidationDistance.gt(0) &&
    risk.liquidationDistance.lt(ONE)
  ) {
    units = units.plus(ONE.div(risk.liquidationDistance).minus(ONE));
  }
  if (
    risk.hedgeLiquidationDistance !== null &&
    risk.hedgeLiquidationDistance.gt(0) &&
    risk.hedgeLiquidationDistance.lt(ONE)
  ) {
    units = units.plus(ONE.div(risk.hedgeLiquidationDistance).minus(ONE));
  }
  return units.gt(0) ? portfolioNetApy.div(units) : ZERO;
}

export function blendWithReserve(args: {
  strategyNetUsd: Decimal;
  reserveUsd: Decimal;
  reserveApy: Decimal;
  deployableUsd: Decimal;
}): { portfolioEstimatedNetUsd: Decimal; portfolioEstimatedNetApy: Decimal } {
  const reserveIncome = args.reserveUsd.mul(args.reserveApy);
  const portfolioEstimatedNetUsd = args.strategyNetUsd.plus(reserveIncome);
  const portfolioEstimatedNetApy = args.deployableUsd.gt(0)
    ? portfolioEstimatedNetUsd.div(args.deployableUsd)
    : ZERO;
  return { portfolioEstimatedNetUsd, portfolioEstimatedNetApy };
}

export function actionGasUsd(
  snapshot: ResolvedMarket['snapshot'],
  network: string,
  action: string,
): Decimal {
  const row = snapshot.costs?.gas?.[network]?.actions?.[action];
  return d(row?.usdAtPlanning ?? 0);
}

export { max0, ZERO, ONE, d };
