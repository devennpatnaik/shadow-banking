import { seedDepositBreakdown, type Decimal } from '@shadow-banking/core';
import type { CapitalPlan, ComparisonInput, StrategyEvaluation, StrategyId } from './types.js';
import {
  ONE,
  ZERO,
  actionGasUsd,
  amortize,
  blendWithReserve,
  cheapRampRoundTripUsd,
  d,
  loopRisk,
  max0,
  riskAdjustedApy,
  unleveredRisk,
  yieldStack,
  years,
} from './economics.js';

const GOVERNOR_MAX_LOOP_LEVERAGE = d(3);
const GOVERNOR_PHASE6_LOOP_CAP = d(3);

function ineligible(
  id: StrategyId,
  label: string,
  capital: CapitalPlan,
  reason: string,
): StrategyEvaluation {
  const empty = yieldStack({
    equityUsd: capital.deployableUsd,
    grossIncomeUsd: ZERO,
    financingUsd: ZERO,
    executionUsd: ZERO,
    expectedLossUsd: ZERO,
  });
  const risk = unleveredRisk({
    asset: 'USDC',
    protocol: 'none',
    network: 'none',
    directionalExposure: ZERO,
  });
  return {
    id,
    label,
    eligible: false,
    ineligibleReason: reason,
    equityUsd: capital.deployableUsd,
    deployedUsd: ZERO,
    debtUsd: ZERO,
    reserveUsd: capital.reserveUsd,
    yield: empty,
    portfolioEstimatedNetUsd: ZERO,
    portfolioEstimatedNetApy: ZERO,
    risk,
    riskAdjustedApy: ZERO,
    clearsHurdle: false,
    portfolioClearsHurdle: false,
    oneOffCostsUsd: ZERO,
    assumptions: [reason],
  };
}

function finish(
  partial: Omit<
    StrategyEvaluation,
    'riskAdjustedApy' | 'clearsHurdle' | 'portfolioClearsHurdle'
  > & {
    hurdleApy: Decimal;
  },
): StrategyEvaluation {
  const { hurdleApy, ...rest } = partial;
  return {
    ...rest,
    riskAdjustedApy: riskAdjustedApy(rest.portfolioEstimatedNetApy, rest.risk),
    clearsHurdle: rest.yield.estimatedNetApy.gte(hurdleApy),
    portfolioClearsHurdle: rest.portfolioEstimatedNetApy.gte(hurdleApy),
  };
}

/** No-deployment: entire deployable capital in the best USDC supply market. */
export function evaluatePreserve(input: ComparisonInput): StrategyEvaluation {
  const { market, capital, hurdleApy, horizonDays } = input;
  const equity = capital.deployableUsd;
  const gas = actionGasUsd(market.snapshot, market.usdcNetwork, 'approve').plus(
    actionGasUsd(market.snapshot, market.usdcNetwork, 'supply'),
  );
  const oneOff = gas.mul(2); // enter + exit
  const gross = equity.mul(market.usdcSupplyApy);
  const execution = amortize(oneOff, horizonDays);
  const y = yieldStack({
    equityUsd: equity,
    grossIncomeUsd: gross,
    financingUsd: ZERO,
    executionUsd: execution,
    expectedLossUsd: ZERO,
  });
  const risk = unleveredRisk({
    asset: 'USDC',
    protocol: market.usdcProtocol,
    network: market.usdcNetwork,
    directionalExposure: ZERO,
  });
  return finish({
    id: 'preserve-liquid',
    label: `Preserve liquid: USDC on ${market.usdcProtocol} ${market.usdcNetwork}`,
    eligible: true,
    equityUsd: equity,
    deployedUsd: equity,
    debtUsd: ZERO,
    reserveUsd: equity,
    yield: y,
    portfolioEstimatedNetUsd: y.estimatedNetUsd,
    portfolioEstimatedNetApy: y.estimatedNetApy,
    risk,
    oneOffCostsUsd: oneOff,
    hurdleApy,
    assumptions: [
      `USDC supply APY ${market.usdcSupplyApy.mul(100).toFixed(2)}% (snapshot ${market.snapshotDate}). Estimate, not realized.`,
      'No ETH price exposure. Residual risks are stablecoin issuer/depeg and lending-protocol contract risk (not priced).',
    ],
  });
}

export function evaluateHoldLst(input: ComparisonInput): StrategyEvaluation {
  const { market, capital, hurdleApy, horizonDays } = input;
  if (capital.investableUsd.lte(0)) {
    return ineligible(
      'hold-lst',
      `Hold ${market.lstSymbol}`,
      capital,
      'No investable capital after the liquidity reserve.',
    );
  }
  const oneOff = cheapRampRoundTripUsd(capital.investableUsd, market).plus(
    actionGasUsd(market.snapshot, market.network, 'swap').mul(2),
  );
  const invested = max0(capital.investableUsd.minus(oneOff.div(2)));
  const gross = invested.mul(market.lstYieldApy);
  const execution = amortize(oneOff, horizonDays);
  const y = yieldStack({
    equityUsd: invested,
    grossIncomeUsd: gross,
    financingUsd: ZERO,
    executionUsd: execution,
    expectedLossUsd: ZERO,
  });
  const blended = blendWithReserve({
    strategyNetUsd: y.estimatedNetUsd,
    reserveUsd: capital.reserveUsd,
    reserveApy: market.usdcSupplyApy,
    deployableUsd: capital.deployableUsd,
  });
  const breakdown = seedDepositBreakdown({
    seed: capital.deployableUsd,
    reserve: capital.reserveUsd,
    entryCosts: oneOff.div(2),
    ownerDeployed: invested,
    borrowed: ZERO,
    collateralCommitted: ZERO,
  });
  return finish({
    id: 'hold-lst',
    label: `Hold ${market.lstSymbol} (1x)`,
    eligible: true,
    equityUsd: invested,
    deployedUsd: breakdown.deployed,
    debtUsd: ZERO,
    reserveUsd: capital.reserveUsd,
    yield: y,
    ...blended,
    risk: unleveredRisk({
      asset: market.lstSymbol,
      protocol: market.protocol,
      network: market.network,
      directionalExposure: ONE,
    }),
    oneOffCostsUsd: oneOff,
    hurdleApy,
    assumptions: [
      `${market.lstSymbol} yield ${market.lstYieldApy.mul(100).toFixed(2)}% (snapshot ${market.snapshotDate}).`,
      `Cheap USDC rails round-trip; owner vs borrowed: owner ${breakdown.ownerCapital.toFixed(2)}, borrowed 0.`,
    ],
  });
}

function evaluateLoopAtLeverage(
  input: ComparisonInput,
  k: Decimal,
  id: StrategyId,
): StrategyEvaluation {
  const { market, capital, hurdleApy, horizonDays, includeUnwindCosts } = input;
  const label = `Recursive ${market.lstSymbol}/${market.borrowSymbol} loop ${k.toFixed(0)}x`;
  if (!capital.leverageAllowed) {
    return ineligible(id, label, capital, 'Disclosures prohibit leverage.');
  }
  if (capital.investableUsd.lte(0)) {
    return ineligible(id, label, capital, 'No investable capital after the liquidity reserve.');
  }
  if (k.gt(GOVERNOR_MAX_LOOP_LEVERAGE)) {
    return ineligible(
      id,
      label,
      capital,
      `Leverage ${k.toFixed(1)}x exceeds the governor correlated-loop cap of ${GOVERNOR_MAX_LOOP_LEVERAGE.toFixed(1)}x.`,
    );
  }

  const extraTurns = k.minus(ONE);
  const setupGas = ['approve', 'supply', 'setEMode']
    .map((a) => actionGasUsd(market.snapshot, market.network, a))
    .reduce((a, b) => a.plus(b), ZERO);
  const loopGas = ['borrow', 'swap', 'supply']
    .map((a) => actionGasUsd(market.snapshot, market.network, a))
    .reduce((a, b) => a.plus(b), ZERO);
  const unwindGas = includeUnwindCosts
    ? ['swap', 'repay', 'withdraw']
        .map((a) => actionGasUsd(market.snapshot, market.network, a))
        .reduce((a, b) => a.plus(b), ZERO)
    : ZERO;
  const ramp = cheapRampRoundTripUsd(capital.investableUsd, market);
  const haircut = market.swapFeeWstEth.plus(market.swapImpactWstEth);

  // Size k× on post-entry equity (economics-1k §5.1). Swap haircut is a one-off cost, not a
  // reduction in collateral, so leverage stays exactly k and comparable to the governor cap.
  const entryRamp = ramp.div(2);
  const equity = max0(capital.investableUsd.minus(entryRamp).minus(setupGas));
  const debt = equity.mul(extraTurns);
  const collateral = equity.mul(k);
  const swapCost = debt.mul(haircut).plus(includeUnwindCosts ? debt.mul(haircut) : ZERO);
  const oneOff = ramp.plus(setupGas).plus(loopGas.mul(extraTurns)).plus(unwindGas).plus(swapCost);

  const gross = collateral.mul(market.lstYieldApy);
  const financing = debt.mul(market.borrowApy);
  const risk = loopRisk({
    market,
    collateralUsd: collateral,
    debtUsd: debt,
    horizonDays,
    maxLeverage: GOVERNOR_PHASE6_LOOP_CAP,
  });
  const expectedLossAnnual = years(horizonDays).gt(0)
    ? risk.expectedLiquidationLossUsd.div(years(horizonDays))
    : risk.expectedLiquidationLossUsd;
  const y = yieldStack({
    equityUsd: equity,
    grossIncomeUsd: gross,
    financingUsd: financing,
    executionUsd: amortize(oneOff, horizonDays),
    expectedLossUsd: expectedLossAnnual,
  });
  const blended = blendWithReserve({
    strategyNetUsd: y.estimatedNetUsd,
    reserveUsd: capital.reserveUsd,
    reserveApy: market.usdcSupplyApy,
    deployableUsd: capital.deployableUsd,
  });
  const breakdown = seedDepositBreakdown({
    seed: capital.deployableUsd,
    reserve: capital.reserveUsd,
    entryCosts: entryRamp.plus(setupGas),
    ownerDeployed: equity,
    borrowed: debt,
    collateralCommitted: collateral,
  });
  return finish({
    id,
    label,
    eligible: true,
    equityUsd: equity,
    deployedUsd: breakdown.deployed,
    debtUsd: debt,
    reserveUsd: capital.reserveUsd,
    yield: y,
    ...blended,
    risk,
    oneOffCostsUsd: oneOff,
    hurdleApy,
    assumptions: [
      `carry(k)=y+(k−1)(y−b) with y=${market.lstYieldApy.mul(100).toFixed(2)}%, b=${market.borrowApy.mul(100).toFixed(2)}%, k=${k.toFixed(0)}.`,
      `Aave E-mode LTV ${market.ltv.mul(100).toFixed(1)}% / LT ${market.liquidationThreshold.mul(100).toFixed(1)}% / bonus ${market.liquidationBonus.mul(100).toFixed(1)}%.`,
      `Owner capital ${breakdown.ownerCapital.toFixed(2)} vs borrowed ${breakdown.borrowedCapital.toFixed(2)}.`,
      risk.fullyLiquidatableInOneCall
        ? 'Aave v3.3 small-position rule: collateral or debt < $2,000 so a breach is a 100% close.'
        : 'Position is above the $2,000 small-position threshold.',
    ],
  });
}

export function evaluateLoop2x(input: ComparisonInput): StrategyEvaluation {
  return evaluateLoopAtLeverage(input, d(2), 'loop-2x');
}

export function evaluateLoop3x(input: ComparisonInput): StrategyEvaluation {
  return evaluateLoopAtLeverage(input, d(3), 'loop-3x');
}

export function evaluateHedgedCarry(input: ComparisonInput): StrategyEvaluation {
  const { market, capital, hurdleApy, horizonDays, hedgedLongShare } = input;
  const hl = market.hyperliquid;
  const label = `Hedged carry: ${market.lstSymbol} long + ETH-PERP short (${hedgedLongShare.mul(100).toFixed(0)}/${ONE.minus(hedgedLongShare).mul(100).toFixed(0)})`;
  if (!capital.derivativesAllowed) {
    return ineligible('hedged-carry', label, capital, 'Disclosures prohibit derivatives.');
  }
  if (capital.investableUsd.lte(0)) {
    return ineligible(
      'hedged-carry',
      label,
      capital,
      'No investable capital after the liquidity reserve.',
    );
  }

  const longUsd = capital.investableUsd.mul(hedgedLongShare);
  const marginUsd = capital.investableUsd.minus(longUsd);
  const shortNotional = longUsd;
  const venueLeverage = marginUsd.gt(0) ? shortNotional.div(marginUsd) : ZERO;
  const breaches: string[] = [];
  if (shortNotional.lt(hl.minOrderNotionalUsd)) {
    breaches.push(
      `short notional ${shortNotional.toFixed(2)} below Hyperliquid min order ${hl.minOrderNotionalUsd.toFixed(2)}`,
    );
  }
  if (marginUsd.lt(hl.minDepositUsdc)) {
    breaches.push(
      `margin ${marginUsd.toFixed(2)} below Hyperliquid min deposit ${hl.minDepositUsdc.toFixed(2)}`,
    );
  }
  if (venueLeverage.gt(hl.governorMaxVenueLeverage)) {
    breaches.push(
      `venue leverage ${venueLeverage.toFixed(2)}x above governor isolated-margin cap ${hl.governorMaxVenueLeverage.toFixed(2)}x`,
    );
  }
  if (shortNotional.gt(longUsd.mul('1.05'))) {
    breaches.push('hedge notional exceeds 100% of the long + 5%');
  }

  const mmr = hl.ethMaintenanceMarginRate;
  const hedgeLd = venueLeverage.gt(0) ? max0(ONE.div(venueLeverage).minus(mmr)) : null;
  const openClose = shortNotional.mul(hl.takerFeeRate).mul(2);
  const rebalance = shortNotional.mul(hl.takerFeeRate).mul('0.25').mul(4);
  const ramp = cheapRampRoundTripUsd(longUsd, market);
  const oneOff = ramp
    .plus(openClose)
    .plus(hl.withdrawalFeeUsdc)
    .plus(actionGasUsd(market.snapshot, 'arbitrum', 'hyperliquidBridgeDeposit'));

  const staking = longUsd.mul(market.lstYieldApy);
  const funding = shortNotional.mul(hl.fundingApr);
  const gross = staking.plus(funding);
  const execution = amortize(oneOff, horizonDays).plus(rebalance);
  const y = yieldStack({
    equityUsd: capital.investableUsd,
    grossIncomeUsd: gross,
    financingUsd: ZERO,
    executionUsd: execution,
    expectedLossUsd: ZERO,
  });
  const blended = blendWithReserve({
    strategyNetUsd: y.estimatedNetUsd,
    reserveUsd: capital.reserveUsd,
    reserveApy: market.usdcSupplyApy,
    deployableUsd: capital.deployableUsd,
  });
  const risk = {
    healthFactor: null,
    liquidationDistance: null,
    hedgeLiquidationDistance: hedgeLd,
    leverage: venueLeverage,
    ltv: null,
    directionalExposure: ZERO,
    concentration: {
      byAsset: `${market.lstSymbol}+ETH-PERP`,
      byProtocol: 'hyperliquid',
      byNetwork: 'hyperliquid',
      assetShare: hedgedLongShare,
      protocolShare: marginUsd.div(capital.investableUsd),
    },
    smallPosition: false,
    fullyLiquidatableInOneCall: false,
    expectedLiquidationLossUsd: ZERO,
    breaches,
    withinGovernorLimits: breaches.length === 0,
  };
  return finish({
    id: 'hedged-carry',
    label,
    eligible: true,
    equityUsd: capital.investableUsd,
    deployedUsd: capital.investableUsd,
    debtUsd: ZERO,
    reserveUsd: capital.reserveUsd,
    yield: y,
    ...blended,
    risk,
    oneOffCostsUsd: oneOff,
    hurdleApy,
    assumptions: [
      `Economics: staking yield + funding received − execution. Funding basis ${hl.fundingApr.mul(100).toFixed(2)}% APR (shorts receive when positive).`,
      `Long ${longUsd.toFixed(2)} / isolated margin ${marginUsd.toFixed(2)} / short ${shortNotional.toFixed(2)}. Venue leverage ${venueLeverage.toFixed(2)}x.`,
      `Hedge liquidation distance ≈ 1/leverage − MMR = ${hedgeLd ? hedgeLd.mul(100).toFixed(1) : 'n/a'}%. Funding can reverse; hedges can fail.`,
    ],
  });
}

export function evaluateLp(input: ComparisonInput): StrategyEvaluation {
  const { market, capital, hurdleApy, horizonDays } = input;
  const label = `LP ${market.lstSymbol}/ETH`;
  if (!capital.lpAllowed) {
    return ineligible('lp', label, capital, 'Disclosures exclude LP positions.');
  }
  if (capital.investableUsd.lte(0)) {
    return ineligible('lp', label, capital, 'No investable capital after the liquidity reserve.');
  }
  const oneOff = cheapRampRoundTripUsd(capital.investableUsd, market).plus(
    actionGasUsd(market.snapshot, market.network, 'swap').mul(2),
  );
  const invested = max0(capital.investableUsd.minus(oneOff.div(2)));
  const staking = invested.div(2).mul(market.lstYieldApy);
  const fees = invested.mul(market.lpFeeApr);
  const lvr = invested.mul(market.lpLvrApr);
  const y = yieldStack({
    equityUsd: invested,
    grossIncomeUsd: staking.plus(fees),
    financingUsd: ZERO,
    executionUsd: amortize(oneOff, horizonDays),
    expectedLossUsd: lvr,
  });
  const blended = blendWithReserve({
    strategyNetUsd: y.estimatedNetUsd,
    reserveUsd: capital.reserveUsd,
    reserveApy: market.usdcSupplyApy,
    deployableUsd: capital.deployableUsd,
  });
  return finish({
    id: 'lp',
    label,
    eligible: true,
    equityUsd: invested,
    deployedUsd: invested,
    debtUsd: ZERO,
    reserveUsd: capital.reserveUsd,
    yield: y,
    ...blended,
    risk: unleveredRisk({
      asset: `${market.lstSymbol}/ETH`,
      protocol: 'dex-lp',
      network: market.network,
      directionalExposure: d('0.5'),
    }),
    oneOffCostsUsd: oneOff,
    hurdleApy,
    assumptions: [
      `Half the capital is unstaked ETH. Fee APR ${market.lpFeeApr.mul(100).toFixed(2)}% (modelling default). LVR ${market.lpLvrApr.mul(100).toFixed(2)}%/yr.`,
      'Optional strategy: omitted from any recommendation unless it clears the hurdle on a risk-adjusted basis.',
    ],
  });
}

export const EVALUATORS: Record<StrategyId, (input: ComparisonInput) => StrategyEvaluation> = {
  'preserve-liquid': evaluatePreserve,
  'hold-lst': evaluateHoldLst,
  'loop-2x': evaluateLoop2x,
  'loop-3x': evaluateLoop3x,
  'hedged-carry': evaluateHedgedCarry,
  lp: evaluateLp,
};

export const STRATEGY_ORDER: StrategyId[] = [
  'preserve-liquid',
  'hold-lst',
  'loop-2x',
  'loop-3x',
  'hedged-carry',
  'lp',
];
