import {
  d,
  ONE,
  ZERO,
  healthFactor,
  liquidationDistance,
  type Decimal,
} from '@shadow-banking/core';
import { liquidationTouchProbability } from './probability.js';
import type { MarketInput, RiskAssessment, StoppingRule } from './types.js';

/**
 * Close factor rules modelled on Aave v3.3:
 *  - default 50% of the debt per liquidation call;
 *  - 100% when HF < 0.95;
 *  - 100% when total collateral or total debt is below the small-position threshold ($2,000),
 *    which is exactly the regime a $1,000 seed lives in.
 */
export function closeFactor(
  market: MarketInput,
  collateralUsd: Decimal,
  debtUsd: Decimal,
  hf: Decimal | null,
): { closeFactor: Decimal; smallPosition: boolean } {
  const smallPosition =
    collateralUsd.lt(market.smallPositionUsd) || debtUsd.lt(market.smallPositionUsd);
  if (smallPosition) return { closeFactor: ONE, smallPosition };
  if (hf !== null && hf.lt(market.fullLiquidationHfThreshold))
    return { closeFactor: ONE, smallPosition };
  return { closeFactor: market.closeFactor, smallPosition };
}

export function effectiveMinHealthFactor(rule: StoppingRule, smallPosition: boolean): Decimal {
  const base = rule.minHealthFactor.plus(rule.postActionHfBuffer);
  return smallPosition ? base.plus(rule.smallPositionHfBuffer) : base;
}

export function assessRisk(args: {
  market: MarketInput;
  rule: StoppingRule;
  collateralUsd: Decimal;
  debtUsd: Decimal;
  equityUsd: Decimal;
  volatility: Decimal;
  horizonYears: Decimal;
}): RiskAssessment {
  const { market, rule, collateralUsd, debtUsd, equityUsd, volatility, horizonYears } = args;
  const hf = healthFactor(
    [{ value: collateralUsd, ltv: market.ltv, liquidationThreshold: market.liquidationThreshold }],
    debtUsd,
  );
  const drop = liquidationDistance(hf);
  // Close factor at the moment of liquidation: HF has just crossed 1 (so the 0.95 rule does not
  // apply yet); only the small-position rule matters there.
  const { closeFactor: cf, smallPosition } = closeFactor(market, collateralUsd, debtUsd, ONE);
  const p =
    drop === null
      ? null
      : d(
          liquidationTouchProbability(
            drop.toNumber(),
            volatility.toNumber(),
            horizonYears.toNumber(),
          ),
        );
  const expectedLoss = p === null ? ZERO : p.mul(cf).mul(debtUsd).mul(market.liquidationBonus);
  const minHf = effectiveMinHealthFactor(rule, smallPosition);
  const leverage = equityUsd.gt(0) ? collateralUsd.div(equityUsd) : null;

  const breaches: string[] = [];
  if (hf !== null && hf.lt(minHf)) {
    breaches.push(
      `health factor ${hf.toFixed(3)} below effective minimum ${minHf.toFixed(2)}${smallPosition ? ' (small-position buffer applied)' : ''}`,
    );
  }
  if (drop !== null && drop.lt(rule.minPriceDropToLiquidation)) {
    breaches.push(
      `price drop to liquidation ${drop.mul(100).toFixed(2)}% below minimum ${rule.minPriceDropToLiquidation.mul(100).toFixed(2)}%`,
    );
  }
  if (p !== null && p.gt(rule.maxLiquidationProbability)) {
    breaches.push(
      `estimated liquidation probability ${p.mul(100).toFixed(2)}% above maximum ${rule.maxLiquidationProbability.mul(100).toFixed(2)}%`,
    );
  }
  if (leverage === null) {
    breaches.push('equity is zero or negative');
  } else if (leverage.gt(rule.maxLeverage)) {
    breaches.push(`leverage ${leverage.toFixed(2)}x above maximum ${rule.maxLeverage.toFixed(2)}x`);
  }

  return {
    healthFactor: hf,
    priceDropToLiquidation: drop,
    liquidationProbability: p,
    smallPosition,
    closeFactorAtLiquidation: cf,
    fullyLiquidatableInOneCall: cf.eq(ONE),
    effectiveMinHealthFactor: minHf,
    expectedLiquidationLossUsd: expectedLoss,
    breaches,
  };
}

/**
 * One liquidation call: the liquidator repays `closeFactor × debt` and seizes that amount plus
 * the bonus in collateral. If collateral cannot cover it, the protocol is left with bad debt.
 */
export function liquidateOnce(
  collateralUsd: Decimal,
  debtUsd: Decimal,
  bonus: Decimal,
  cf: Decimal,
): {
  collateralUsd: Decimal;
  debtUsd: Decimal;
  repaid: Decimal;
  seized: Decimal;
  bonusCost: Decimal;
  badDebt: Decimal;
} {
  let repaid = debtUsd.mul(cf);
  let seized = repaid.mul(ONE.plus(bonus));
  let badDebt = ZERO;
  if (seized.gt(collateralUsd)) {
    seized = collateralUsd;
    repaid = seized.div(ONE.plus(bonus));
    badDebt = debtUsd.minus(repaid);
  }
  return {
    collateralUsd: collateralUsd.minus(seized),
    debtUsd: debtUsd.minus(repaid),
    repaid,
    seized,
    bonusCost: repaid.mul(bonus),
    badDebt,
  };
}
