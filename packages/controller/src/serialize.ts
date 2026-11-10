import { reportToJson } from '@shadow-banking/accounting';
import { buildPerformanceReport } from '@shadow-banking/accounting';
import { toJsonNumber } from '@shadow-banking/core';
import { comparisonToJson, stackToJson } from '@shadow-banking/strategy';
import { evaluationToJson } from '@shadow-banking/risk';
import { PAPER_ENVELOPE } from './envelope.js';
import type { PaperRunResult, PaperStepRecord } from './types.js';

function stepJson(s: PaperStepRecord): Record<string, unknown> {
  return {
    step: s.step,
    at: s.at,
    snapshotDate: s.snapshotDate,
    posture: s.posture,
    strategyId: s.strategyId,
    legs: s.legs,
    nextLeg: s.nextLeg,
    recommendedAction: s.recommendedAction,
    noDeployment: s.noDeployment,
    clearsHurdle: s.clearsHurdle,
    riskState: s.riskState,
    veto: s.veto,
    executed: s.executed,
    proposalId: s.proposalId,
    intents: s.intents,
    nav: toJsonNumber(s.nav),
    debt: toJsonNumber(s.debt),
    income: toJsonNumber(s.income),
    costs: toJsonNumber(s.costs),
    drawdown: toJsonNumber(s.drawdown),
    reasons: s.reasons,
  };
}

export function paperRunToJson(result: PaperRunResult): Record<string, unknown> {
  const perf = buildPerformanceReport(result.ledger, result.config.hurdleApy);
  return {
    ...PAPER_ENVELOPE,
    ok: !result.veto,
    command: 'paper',
    engine: '@shadow-banking/controller',
    headline: result.headline,
    posture: result.posture,
    noDeployment: result.noDeployment,
    recommendedAction: result.recommendedAction,
    veto: result.veto,
    nav: toJsonNumber(result.nav),
    debt: toJsonNumber(result.debt),
    income: toJsonNumber(result.income),
    costs: toJsonNumber(result.costs),
    drawdown: toJsonNumber(result.drawdown),
    hurdle: toJsonNumber(result.config.hurdleApy),
    seed: toJsonNumber(result.config.seedUsd),
    steps: result.steps.map(stepJson),
    stateDir: result.stateDir,
    snapshot: result.config.snapshotPath,
    provider: result.config.provider,
    clock: {
      start: result.startedAt,
      end: result.endedAt,
      unit: result.config.clockUnit,
      stepDays: result.config.stepDays,
    },
    performance: reportToJson(perf),
    comparison: result.lastComparison ? comparisonToJson(result.lastComparison) : null,
    stack: result.lastStack ? stackToJson(result.lastStack) : null,
    governor: result.lastEvaluation ? evaluationToJson(result.lastEvaluation, 'paper') : null,
    assistedExecution: {
      status: 'propose_approve_only',
      phase: 5,
      note: 'Use pnpm execution for Phase 5 propose+approve. Paper loop still does not sign or broadcast.',
    },
  };
}
