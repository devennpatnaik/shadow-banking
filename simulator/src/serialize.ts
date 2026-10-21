import { toJsonNumber, type Decimal } from '@shadow-banking/core';
import type { LoopStep, SimulationResult } from './types.js';

function dec(v: Decimal | null | undefined): string | null {
  if (v === undefined) return null;
  return toJsonNumber(v);
}

export function stepToJson(step: LoopStep): Record<string, unknown> {
  return {
    index: step.index,
    borrowedThisStep: dec(step.borrowedThisStep),
    collateralUsd: dec(step.collateralUsd),
    debtUsd: dec(step.debtUsd),
    equityUsd: dec(step.equityUsd),
    leverage: dec(step.leverage),
    ltv: dec(step.ltv),
    entryCostsUsd: dec(step.entryCostsUsd),
    unwindCostsUsd: dec(step.unwindCostsUsd),
    grossIncomeUsd: dec(step.grossIncomeUsd),
    interestExpenseUsd: dec(step.interestExpenseUsd),
    carryUsd: dec(step.carryUsd),
    amortizedCostsUsd: dec(step.amortizedCostsUsd),
    expectedLiquidationLossAnnualUsd: dec(step.expectedLiquidationLossAnnualUsd),
    netIncomeUsd: dec(step.netIncomeUsd),
    grossRoe: dec(step.grossRoe),
    netRoe: dec(step.netRoe),
    netYieldOnSeed: dec(step.netYieldOnSeed),
    costPaybackDays: dec(step.costPaybackDays),
    withinLimits: step.withinLimits,
    risk: {
      healthFactor: dec(step.risk.healthFactor),
      priceDropToLiquidation: dec(step.risk.priceDropToLiquidation),
      liquidationProbability: dec(step.risk.liquidationProbability),
      smallPosition: step.risk.smallPosition,
      closeFactorAtLiquidation: dec(step.risk.closeFactorAtLiquidation),
      fullyLiquidatableInOneCall: step.risk.fullyLiquidatableInOneCall,
      effectiveMinHealthFactor: dec(step.risk.effectiveMinHealthFactor),
      expectedLiquidationLossUsd: dec(step.risk.expectedLiquidationLossUsd),
      breaches: step.risk.breaches,
    },
    marginal: {
      additionalProductiveAssetsUsd: dec(step.marginal.additionalProductiveAssetsUsd),
      additionalRecurringIncomeUsd: dec(step.marginal.additionalRecurringIncomeUsd),
      additionalInterestExpenseUsd: dec(step.marginal.additionalInterestExpenseUsd),
      additionalEquityExposureUsd: dec(step.marginal.additionalEquityExposureUsd),
      additionalLeverage: dec(step.marginal.additionalLeverage),
      additionalLiquidationRisk: dec(step.marginal.additionalLiquidationRisk),
      additionalLiquidationProbability: dec(step.marginal.additionalLiquidationProbability),
      additionalNetIncomeUsd: dec(step.marginal.additionalNetIncomeUsd),
      incrementalRoe: dec(step.marginal.incrementalRoe),
    },
  };
}

export function resultToJson(result: SimulationResult): Record<string, unknown> {
  return {
    label: result.input.label,
    presetId: result.input.presetId ?? null,
    snapshotDate: result.input.snapshotDate,
    figures: 'estimates',
    seedUsd: dec(result.input.seedUsd),
    investedUsd: dec(result.investedUsd),
    reserveUsd: dec(result.reserveUsd),
    stopReason: result.stopReason,
    stopDetail: result.stopDetail,
    recommendation: {
      action: result.recommendation.action,
      loops: result.recommendation.loops,
      netRoe: dec(result.recommendation.netRoe),
      netYieldOnSeed: dec(result.recommendation.netYieldOnSeed),
      clearsHurdle: result.recommendation.clearsHurdle,
      hurdleApy: dec(result.recommendation.hurdleApy),
      reasons: result.recommendation.reasons,
    },
    seedBreakdown: Object.fromEntries(
      Object.entries(result.seedBreakdown).map(([k, v]) => [k, dec(v)]),
    ),
    smallPosition: (result.steps[result.recommendation.loops] ?? result.steps[0])?.risk
      .smallPosition,
    effectiveMinHealthFactor: dec(
      (result.steps[result.recommendation.loops] ?? result.steps[0])?.risk
        .effectiveMinHealthFactor ?? null,
    ),
    steps: result.steps.map(stepToJson),
    warnings: result.warnings,
  };
}
