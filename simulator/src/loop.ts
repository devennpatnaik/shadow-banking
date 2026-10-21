import { d, DAYS_PER_YEAR, ONE, ZERO, max0, min, type Decimal } from '@shadow-banking/core';
import { loopGasUsd, setupGasUsd, swapCostUsd, swapHaircut, unwindGasUsd } from './costs.js';
import { assessRisk } from './risk.js';
import type {
  LoopStep,
  Recommendation,
  SimulationInput,
  SimulationResult,
  StopReason,
} from './types.js';

function years(days: number): Decimal {
  return d(days).div(DAYS_PER_YEAR);
}

function stepLtvOf(input: SimulationInput): Decimal {
  return input.stepLtv ?? input.market.ltv;
}

function availableBorrow(collateralUsd: Decimal, debtUsd: Decimal, ltv: Decimal): Decimal {
  return max0(collateralUsd.mul(ltv).minus(debtUsd));
}

function paybackDays(entryCosts: Decimal, carry: Decimal): Decimal | null {
  if (carry.lte(0) || entryCosts.lte(0)) return entryCosts.lte(0) ? ZERO : null;
  return entryCosts.div(carry).mul(DAYS_PER_YEAR);
}

function evaluateState(
  input: SimulationInput,
  index: number,
  borrowedThisStep: Decimal,
  collateralUsd: Decimal,
  debtUsd: Decimal,
  entryCostsUsd: Decimal,
  prev: LoopStep | null,
): LoopStep {
  const horizonYears = years(input.horizonDays);
  const equityUsd = collateralUsd.minus(debtUsd);
  const leverage = equityUsd.gt(0) ? collateralUsd.div(equityUsd) : ZERO;
  const ltv = collateralUsd.gt(0) ? debtUsd.div(collateralUsd) : ZERO;
  const unwindSwap =
    input.includeUnwindCosts && debtUsd.gt(0) ? swapCostUsd(debtUsd, input.costs) : ZERO;
  const unwindCostsUsd =
    input.includeUnwindCosts && (debtUsd.gt(0) || index > 0)
      ? unwindGasUsd(input.costs).plus(unwindSwap)
      : ZERO;
  const totalOneOff = entryCostsUsd.plus(unwindCostsUsd);
  const amortizedCostsUsd = horizonYears.gt(0) ? totalOneOff.div(horizonYears) : totalOneOff;
  const grossIncomeUsd = collateralUsd.mul(input.collateral.yieldApy);
  const interestExpenseUsd = debtUsd.mul(input.borrow.variableBorrowApy);
  const carryUsd = grossIncomeUsd.minus(interestExpenseUsd);
  const risk = assessRisk({
    market: input.market,
    rule: input.stopping,
    collateralUsd,
    debtUsd,
    equityUsd,
    volatility: input.collateral.volatility,
    horizonYears,
  });
  const expectedLiquidationLossAnnualUsd = horizonYears.gt(0)
    ? risk.expectedLiquidationLossUsd.div(horizonYears)
    : risk.expectedLiquidationLossUsd;
  const netIncomeUsd = carryUsd.minus(amortizedCostsUsd).minus(expectedLiquidationLossAnnualUsd);
  const grossRoe = equityUsd.gt(0) ? grossIncomeUsd.div(equityUsd) : ZERO;
  const netRoe = equityUsd.gt(0) ? netIncomeUsd.div(equityUsd) : ZERO;
  const reserveIncome = input.seedUsd.mul(input.reserveRate).mul(input.reserveYieldApy);
  const netYieldOnSeed = input.seedUsd.gt(0)
    ? netIncomeUsd.plus(reserveIncome).div(input.seedUsd)
    : ZERO;
  const additionalProductiveAssetsUsd = prev
    ? collateralUsd.minus(prev.collateralUsd)
    : collateralUsd;
  const additionalRecurringIncomeUsd = prev
    ? grossIncomeUsd.minus(prev.grossIncomeUsd)
    : grossIncomeUsd;
  const additionalInterestExpenseUsd = prev
    ? interestExpenseUsd.minus(prev.interestExpenseUsd)
    : interestExpenseUsd;
  const additionalEquityExposureUsd = additionalProductiveAssetsUsd;
  const additionalLeverage = prev ? leverage.minus(prev.leverage) : leverage.minus(ONE);
  const additionalLiquidationRisk =
    prev && risk.priceDropToLiquidation !== null && prev.risk.priceDropToLiquidation !== null
      ? risk.priceDropToLiquidation.minus(prev.risk.priceDropToLiquidation)
      : risk.priceDropToLiquidation;
  const additionalLiquidationProbability =
    prev && risk.liquidationProbability !== null && prev.risk.liquidationProbability !== null
      ? risk.liquidationProbability.minus(prev.risk.liquidationProbability)
      : risk.liquidationProbability;
  const additionalNetIncomeUsd = prev ? netIncomeUsd.minus(prev.netIncomeUsd) : netIncomeUsd;
  const incrementalRoe = equityUsd.gt(0) ? additionalNetIncomeUsd.div(equityUsd) : ZERO;

  return {
    index,
    borrowedThisStep,
    collateralUsd,
    debtUsd,
    equityUsd,
    leverage,
    ltv,
    entryCostsUsd,
    unwindCostsUsd,
    grossIncomeUsd,
    interestExpenseUsd,
    carryUsd,
    amortizedCostsUsd,
    expectedLiquidationLossAnnualUsd,
    netIncomeUsd,
    grossRoe,
    netRoe,
    netYieldOnSeed,
    costPaybackDays: paybackDays(totalOneOff, carryUsd),
    risk,
    marginal: {
      additionalProductiveAssetsUsd,
      additionalRecurringIncomeUsd,
      additionalInterestExpenseUsd,
      additionalEquityExposureUsd,
      additionalLeverage,
      additionalLiquidationRisk,
      additionalLiquidationProbability,
      additionalNetIncomeUsd,
      incrementalRoe,
    },
    withinLimits: risk.breaches.length === 0 && equityUsd.gt(0),
  };
}

function nextLoop(
  input: SimulationInput,
  prev: LoopStep,
): { borrow: Decimal; collateral: Decimal; costs: Decimal } | null {
  const cap = availableBorrow(prev.collateralUsd, prev.debtUsd, stepLtvOf(input));
  if (cap.lte(0)) return null;
  let borrow = cap;
  if (input.policy.kind === 'targetLtv') {
    const targetDebt = prev.collateralUsd.mul(input.policy.targetLtv);
    borrow = min(cap, max0(targetDebt.minus(prev.debtUsd)));
  }
  if (borrow.lt(input.stopping.minBorrowUsd)) return null;
  const received = borrow.mul(swapHaircut(input.costs));
  const gas = loopGasUsd(input.costs);
  return {
    borrow,
    collateral: prev.collateralUsd.plus(received),
    costs: prev.entryCostsUsd.plus(gas).plus(swapCostUsd(borrow, input.costs)),
  };
}

function attractive(_prev: LoopStep, next: LoopStep, input: SimulationInput): boolean {
  if (!next.withinLimits) return false;
  if (next.marginal.additionalNetIncomeUsd.lt(input.stopping.marginalNetIncomeFloorUsd))
    return false;
  // Spec §4C: stop when incremental ROE no longer clears the hurdle (default 10% annualized net).
  if (next.marginal.incrementalRoe.lt(input.stopping.hurdleApy)) return false;
  return true;
}

function recommend(input: SimulationInput, steps: LoopStep[]): Recommendation {
  const hurdle = input.stopping.hurdleApy;
  const legal = steps.filter((s) => s.withinLimits);
  const clearing = legal.filter((s) => s.netYieldOnSeed.gte(hurdle));
  const pickFrom = clearing.length ? clearing : legal;
  const best = pickFrom.reduce((a, b) => (b.netYieldOnSeed.gt(a.netYieldOnSeed) ? b : a));
  const reasons: string[] = [];
  const clearsHurdle = best.netYieldOnSeed.gte(hurdle);
  if (!clearsHurdle || best.index === 0) {
    if (clearsHurdle) {
      reasons.push(
        `Unlevered estimated net yield on seed ${best.netYieldOnSeed.mul(100).toFixed(2)}% clears the ${hurdle.mul(100).toFixed(1)}% hurdle; extra loops do not improve it enough after costs and risk.`,
      );
      return {
        action: 'deploy-unlevered',
        loops: 0,
        netRoe: best.netRoe,
        netYieldOnSeed: best.netYieldOnSeed,
        clearsHurdle,
        hurdleApy: hurdle,
        reasons,
      };
    }
    reasons.push(
      `Nothing clears the ${hurdle.mul(100).toFixed(1)}% annualized net hurdle after costs. Hold the seed in liquid form (spec §5).`,
    );
    const unlevered = steps[0] ?? best;
    return {
      action: 'hold-liquid',
      loops: 0,
      netRoe: unlevered.netRoe,
      netYieldOnSeed: unlevered.netYieldOnSeed,
      clearsHurdle,
      hurdleApy: hurdle,
      reasons,
    };
  }
  reasons.push(
    `${best.index} loop(s): estimated net yield on seed ${best.netYieldOnSeed.mul(100).toFixed(2)}%/yr, estimated net ROE ${best.netRoe.mul(100).toFixed(2)}%/yr. These are estimates at snapshot ${input.snapshotDate}, not realized returns.`,
  );
  if (best.risk.smallPosition) {
    reasons.push(
      `Position is under the Aave v3.3 $${input.market.smallPositionUsd.toFixed(0)} small-position threshold: close factor 100% (fully liquidatable in one call). Effective HF floor ${best.risk.effectiveMinHealthFactor.toFixed(2)}.`,
    );
  }
  return {
    action: 'deploy',
    loops: best.index,
    netRoe: best.netRoe,
    netYieldOnSeed: best.netYieldOnSeed,
    clearsHurdle,
    hurdleApy: hurdle,
    reasons,
  };
}

export function simulateLoop(input: SimulationInput): SimulationResult {
  const warnings = [...input.notes];
  warnings.push(
    'Gross yield, estimated net yield, and risk figures below are estimates from a dated snapshot. They are not realized results and not a promise of return.',
  );
  if (input.seedUsd.lte(0)) throw new RangeError('seedUsd must be > 0');
  if (input.reserveRate.lt(0) || input.reserveRate.gte(1)) {
    throw new RangeError('reserveRate must be in [0, 1)');
  }

  const reserveUsd = input.seedUsd.mul(input.reserveRate);
  const investable = input.seedUsd.minus(reserveUsd);
  const setupGas = setupGasUsd(input.costs);
  const setupSwap = swapCostUsd(investable, input.costs);
  const setupCosts = setupGas.plus(setupSwap);
  if (setupCosts.gte(investable)) {
    warnings.push('Setup costs consume the entire investable seed; nothing is deployed.');
  }
  const investedUsd = max0(investable.minus(setupCosts));
  const step0 = evaluateState(input, 0, ZERO, investedUsd, ZERO, setupCosts, null);

  const steps: LoopStep[] = [step0];
  let stopReason: StopReason = 'policy-loops-complete';
  let stopDetail = 'No loops requested.';
  const maxLoops = Math.min(
    input.stopping.maxLoops,
    input.policy.kind === 'fixed' ? input.policy.loops : input.stopping.maxLoops,
  );

  if (input.policy.kind === 'fixed' && input.policy.loops === 0) {
    stopReason = 'policy-loops-complete';
    stopDetail = 'Fixed policy asked for 0 loops.';
  } else {
    for (let i = 1; i <= maxLoops; i += 1) {
      const prev = steps[steps.length - 1]!;
      const nxt = nextLoop(input, prev);
      if (!nxt) {
        stopReason = prev.debtUsd.gte(prev.collateralUsd.mul(stepLtvOf(input)).mul('0.999'))
          ? 'target-ltv-reached'
          : 'no-borrow-capacity';
        if (
          availableBorrow(prev.collateralUsd, prev.debtUsd, stepLtvOf(input)).lt(
            input.stopping.minBorrowUsd,
          )
        ) {
          stopReason = 'borrow-below-minimum';
        }
        stopDetail = `Stopped before loop ${i}: ${stopReason.replaceAll('-', ' ')}.`;
        break;
      }
      const candidate = evaluateState(
        input,
        i,
        nxt.borrow,
        nxt.collateral,
        prev.debtUsd.plus(nxt.borrow),
        nxt.costs,
        prev,
      );
      if (input.policy.kind === 'optimal') {
        if (!candidate.withinLimits) {
          stopReason = 'risk-limit';
          stopDetail = `Loop ${i} rejected: ${candidate.risk.breaches.join('; ') || 'outside limits'}.`;
          break;
        }
        if (!attractive(prev, candidate, input)) {
          stopReason = 'marginal-economics-unattractive';
          stopDetail = `Loop ${i} rejected: marginal estimated net ${candidate.marginal.additionalNetIncomeUsd.toFixed(2)} USD/yr, incremental ROE ${candidate.marginal.incrementalRoe.mul(100).toFixed(2)}% vs hurdle ${input.stopping.hurdleApy.mul(100).toFixed(1)}%.`;
          break;
        }
      } else if (!candidate.withinLimits && input.policy.kind !== 'fixed') {
        stopReason = 'risk-limit';
        stopDetail = `Loop ${i} rejected: ${candidate.risk.breaches.join('; ')}.`;
        break;
      }
      steps.push(candidate);
      if (
        input.policy.kind === 'targetLtv' &&
        candidate.ltv.gte(input.policy.targetLtv.mul('0.999'))
      ) {
        stopReason = 'target-ltv-reached';
        stopDetail = `Reached target LTV ${input.policy.targetLtv.mul(100).toFixed(2)}% at loop ${i}.`;
        break;
      }
      if (i === maxLoops) {
        stopReason = input.policy.kind === 'fixed' ? 'policy-loops-complete' : 'max-loops';
        stopDetail =
          input.policy.kind === 'fixed'
            ? `Completed ${i} requested loop(s).`
            : `Hit maxLoops=${input.stopping.maxLoops}.`;
      }
    }
  }

  const recommendation = recommend(input, steps);
  const rec = steps[recommendation.loops] ?? steps[0]!;
  const carry = rec.carryUsd;
  return {
    input,
    investedUsd,
    reserveUsd,
    steps,
    stopReason,
    stopDetail,
    recommendation,
    breakevens: {
      borrowApyForZeroCarry: rec.debtUsd.gt(0)
        ? rec.collateralUsd.mul(input.collateral.yieldApy).div(rec.debtUsd)
        : null,
      collateralYieldForZeroCarry: rec.collateralUsd.gt(0)
        ? rec.debtUsd.mul(input.borrow.variableBorrowApy).div(rec.collateralUsd)
        : null,
      gasMultiplierForZeroNet: rec.amortizedCostsUsd.gt(0)
        ? rec.netIncomeUsd.plus(rec.amortizedCostsUsd).div(rec.amortizedCostsUsd)
        : null,
    },
    seedBreakdown: {
      liquid: reserveUsd,
      reserve: reserveUsd,
      deployed: rec.collateralUsd,
      collateral: rec.collateralUsd,
      borrowedAgainst: rec.debtUsd,
      entryCosts: rec.entryCostsUsd,
      ownerCapital: rec.equityUsd.plus(reserveUsd),
      borrowedCapital: rec.debtUsd,
    },
    warnings: carry.lte(0)
      ? [...warnings, 'Estimated carry (yield − borrow) is non-positive at the recommended step.']
      : warnings,
  };
}
