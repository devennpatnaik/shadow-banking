import { toJsonNumber, type Decimal } from '@shadow-banking/core';
import type { ComparisonResult, StrategyEvaluation } from './types.js';
import type { CapitalStack, StackLeg, ProposedStackLeg } from './stack-types.js';

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
    mode: 'diagnostic_single_strategy',
  };
}

export function stackLegToJson(leg: StackLeg): Record<string, unknown> {
  return {
    id: leg.id,
    order: leg.order,
    kind: leg.kind,
    label: leg.label,
    assetSymbol: leg.assetSymbol,
    ownerEquityUsd: dec(leg.ownerEquityUsd),
    borrowedCapitalUsd: dec(leg.borrowedCapitalUsd),
    notionalUsd: dec(leg.notionalUsd),
    incomeUsd: dec(leg.incomeUsd),
    financingUsd: dec(leg.financingUsd),
    executionUsd: dec(leg.executionUsd),
    expectedLossUsd: dec(leg.expectedLossUsd),
    estimatedNetUsd: dec(leg.estimatedNetUsd),
    estimatedNetApy: dec(leg.estimatedNetApy),
    marginalNetUsd: dec(leg.marginalNetUsd),
    marginalNetApy: dec(leg.marginalNetApy),
    healthFactor: dec(leg.healthFactor),
    liquidationDistance: dec(leg.liquidationDistance),
    leverage: dec(leg.leverage),
    notes: leg.notes,
  };
}

function proposedToJson(p: ProposedStackLeg | null): Record<string, unknown> | null {
  if (!p) return null;
  return {
    kind: p.kind,
    label: p.label,
    marginalNetApy: dec(p.marginalNetApy),
    reason: p.reason,
  };
}

export function stackToJson(stack: CapitalStack): Record<string, unknown> {
  return {
    figures: 'estimates',
    snapshotDate: stack.snapshotDate,
    hurdleApy: dec(stack.hurdleApy),
    horizonDays: stack.horizonDays,
    seedUsd: dec(stack.seedUsd),
    ownerEquityUsd: dec(stack.ownerEquityUsd),
    borrowedCapitalUsd: dec(stack.borrowedCapitalUsd),
    reserveUsd: dec(stack.reserveUsd),
    productiveUsd: dec(stack.productiveUsd),
    collateralUsd: dec(stack.collateralUsd),
    idleBorrowedUsd: dec(stack.idleBorrowedUsd),
    debtUsd: dec(stack.debtUsd),
    hedgeNotionalUsd: dec(stack.hedgeNotionalUsd),
    navUsd: dec(stack.navUsd),
    healthFactor: dec(stack.healthFactor),
    liquidationDistance: dec(stack.liquidationDistance),
    leverage: dec(stack.leverage),
    legs: stack.legs.map(stackLegToJson),
    consolidated: {
      grossIncomeUsd: dec(stack.consolidated.grossIncomeUsd),
      grossApy: dec(stack.consolidated.grossApy),
      financingUsd: dec(stack.consolidated.financingUsd),
      executionUsd: dec(stack.consolidated.executionUsd),
      expectedLossUsd: dec(stack.consolidated.expectedLossUsd),
      estimatedNetUsd: dec(stack.consolidated.estimatedNetUsd),
      estimatedNetApy: dec(stack.consolidated.estimatedNetApy),
    },
    consolidatedNetApy: dec(stack.consolidatedNetApy),
    clearsHurdle: stack.clearsHurdle,
    noDeployment: stack.noDeployment,
    recommendedAction: stack.recommendedAction,
    stopReason: stack.stopReason,
    nextProposedLeg: proposedToJson(stack.nextProposedLeg),
    warnings: stack.warnings,
  };
}
