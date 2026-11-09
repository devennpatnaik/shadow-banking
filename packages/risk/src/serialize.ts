import { toJsonNumber, type Decimal } from '@shadow-banking/core';
import { actionCopy } from './action.js';
import type { EvaluationResult, TickResult } from './types.js';

function dec(v: Decimal | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  return toJsonNumber(v);
}

export const PAPER_ENVELOPE = {
  paper: true as const,
  execution: 'forbidden' as const,
  phase: '1-4' as const,
  signingKeys: false as const,
  liveTransactions: false as const,
};

export function tickToJson(t: TickResult, command: string): Record<string, unknown> {
  const m = t.metrics;
  return {
    ...PAPER_ENVELOPE,
    ok: !t.veto,
    command,
    engine: '@shadow-banking/risk',
    spec: 'docs/risk-governor.md',
    source: t.asOf,
    asOf: t.asOf,
    state: t.state,
    previousState: t.previousState,
    riskState: t.state,
    veto: t.veto,
    recommendedAction: t.recommendedAction,
    noDeployment: t.noDeployment,
    hurdle: dec(t.hurdle),
    transition: t.transition,
    dwellHours: dec(t.dwellHours),
    nav: dec(m.navUsd),
    equity: dec(m.equityUsd),
    debt: dec(m.debtUsd),
    reserves: dec(m.reserveHeldUsd),
    metrics: {
      nav: dec(m.navUsd),
      equity: dec(m.equityUsd),
      debt: dec(m.debtUsd),
      reserves: dec(m.reserveHeldUsd),
      reserveRequired: dec(m.reserveRequiredUsd),
      reserveCoverage: m.reserveRequiredUsd.gt(0)
        ? dec(m.reserveHeldUsd.div(m.reserveRequiredUsd))
        : null,
      healthFactor: dec(m.healthFactor),
      liquidationDistance: dec(m.liquidationDistance),
      ltv: dec(m.ltv),
      leverage: dec(m.leverage),
      correlated: m.correlated,
      smallPosition: m.smallPosition,
      drawdown: dec(m.drawdown),
      dailyPnl: dec(m.dailyPnl),
      concentration: {
        protocol: dec(m.concentration.protocolMaxShare),
        network: dec(m.concentration.networkMaxShare),
        asset: dec(m.concentration.nonStableAssetMaxShare),
      },
    },
    triggers: t.triggers,
    limits: {
      maxLeverage: dec(t.limits.maxLeverage),
      hfCaution: dec(t.limits.hfCaution),
      hfDeleveraging: dec(t.limits.hfDeleveraging),
      hfEmergency: dec(t.limits.hfEmergency),
      postActionMinHf: dec(t.limits.postActionMinHf),
    },
    mandated: t.mandated,
    memory: t.memory,
    notes: t.notes,
    action: actionCopy(t.recommendedAction),
  };
}

export function evaluationToJson(e: EvaluationResult, command: string): Record<string, unknown> {
  return {
    ...tickToJson(e, command),
    proposalId: e.proposalId,
    decision: e.decision,
    intents: e.intents.map((i) => ({
      intentId: i.intentId,
      kind: i.kind,
      decision: i.decision,
      reasons: i.reasons,
      modifiedNotionalUsd: dec(i.modifiedNotionalUsd ?? null),
    })),
  };
}
