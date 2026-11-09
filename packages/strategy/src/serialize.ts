import { toJsonNumber, type Decimal } from '@shadow-banking/core';
import type { ComparisonResult, StrategyEvaluation } from './types.js';

function dec(v: Decimal | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  return toJsonNumber(v);
}

export function evaluationToJson(e: StrategyEvaluation): Record<string, unknown> {
  return {
    id: e.id,
    label: e.label,
    eligible: e.eligible,
    ineligibleReason: e.ineligibleReason ?? null,
    equityUsd: dec(e.equityUsd),
    deployedUsd: dec(e.deployedUsd),
    debtUsd: dec(e.debtUsd),
    reserveUsd: dec(e.reserveUsd),
    yield: {
      grossIncomeUsd: dec(e.yield.grossIncomeUsd),
      grossApy: dec(e.yield.grossApy),
      financingUsd: dec(e.yield.financingUsd),
      executionUsd: dec(e.yield.executionUsd),
      expectedLossUsd: dec(e.yield.expectedLossUsd),
      estimatedNetUsd: dec(e.yield.estimatedNetUsd),
      estimatedNetApy: dec(e.yield.estimatedNetApy),
      realized: {
        capable: e.yield.realized.capable,
        incomeUsd: dec(e.yield.realized.incomeUsd),
        apy: dec(e.yield.realized.apy),
        reason: e.yield.realized.reason,
      },
    },
    portfolioEstimatedNetUsd: dec(e.portfolioEstimatedNetUsd),
    portfolioEstimatedNetApy: dec(e.portfolioEstimatedNetApy),
    risk: {
      healthFactor: dec(e.risk.healthFactor),
      liquidationDistance: dec(e.risk.liquidationDistance),
      hedgeLiquidationDistance: dec(e.risk.hedgeLiquidationDistance),
      leverage: dec(e.risk.leverage),
      ltv: dec(e.risk.ltv),
      directionalExposure: dec(e.risk.directionalExposure),
      concentration: {
        byAsset: e.risk.concentration.byAsset,
        byProtocol: e.risk.concentration.byProtocol,
        byNetwork: e.risk.concentration.byNetwork,
        assetShare: dec(e.risk.concentration.assetShare),
        protocolShare: dec(e.risk.concentration.protocolShare),
      },
      smallPosition: e.risk.smallPosition,
      fullyLiquidatableInOneCall: e.risk.fullyLiquidatableInOneCall,
      expectedLiquidationLossUsd: dec(e.risk.expectedLiquidationLossUsd),
      breaches: e.risk.breaches,
      withinGovernorLimits: e.risk.withinGovernorLimits,
    },
    riskAdjustedApy: dec(e.riskAdjustedApy),
    clearsHurdle: e.clearsHurdle,
    portfolioClearsHurdle: e.portfolioClearsHurdle,
    oneOffCostsUsd: dec(e.oneOffCostsUsd),
    assumptions: e.assumptions,
  };
}

export function comparisonToJson(result: ComparisonResult): Record<string, unknown> {
  return {
    figures: 'estimates',
    snapshotDate: result.snapshotDate,
    hurdleApy: dec(result.hurdleApy),
    horizonDays: result.horizonDays,
    capital: {
      seedUsd: dec(result.capital.seedUsd),
      deployableUsd: dec(result.capital.deployableUsd),
      reserveUsd: dec(result.capital.reserveUsd),
      reserveRate: dec(result.capital.reserveRate),
      investableUsd: dec(result.capital.investableUsd),
      householdRequirementUsd: dec(result.capital.householdRequirementUsd),
      shortfallUsd: dec(result.capital.shortfallUsd),
      leverageAllowed: result.capital.leverageAllowed,
      derivativesAllowed: result.capital.derivativesAllowed,
      lpAllowed: result.capital.lpAllowed,
      notes: result.capital.notes,
    },
    evaluations: result.evaluations.map(evaluationToJson),
    recommendation: {
      action: result.recommendation.action,
      strategyId: result.recommendation.strategyId,
      clearsHurdle: result.recommendation.clearsHurdle,
      reasons: result.recommendation.reasons,
    },
    warnings: result.warnings,
  };
}
