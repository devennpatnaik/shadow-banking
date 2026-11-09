import { Decimal, toJsonNumber } from '@shadow-banking/core';
import { PHASE5_ENVELOPE } from './envelope.js';
import type { ExecutionProposal, ProposedAction } from './types.js';

function jsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Decimal) return toJsonNumber(value);
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = jsonSafe(v);
    }
    return out;
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function actionJson(a: ProposedAction): Record<string, unknown> {
  return {
    id: a.id,
    intentId: a.intentId,
    venue: a.venue,
    kind: a.kind,
    functionName: a.functionName,
    notionalUsd: a.notionalUsd.toString(),
    tokenSymbol: a.tokenSymbol,
    tokenAddress: a.tokenAddress,
    network: a.network,
    sdk: a.sdk,
    calldata: a.calldata,
    estimatedGas: a.estimatedGas,
    estimatedGasUsd: a.estimatedGasUsd,
    notes: a.notes,
  };
}

export function proposalToJson(p: ExecutionProposal): Record<string, unknown> {
  return {
    ...PHASE5_ENVELOPE,
    ok: !p.veto && p.status !== 'vetoed',
    command: 'execution',
    engine: '@shadow-banking/execution',
    id: p.id,
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    approvedAt: p.approvedAt,
    rejectedAt: p.rejectedAt,
    veto: p.veto,
    riskState: p.riskState,
    recommendedAction: p.recommendedAction,
    noDeployment: p.noDeployment,
    hurdle: p.hurdle,
    governorDecision: p.governorDecision,
    governorIntents: p.governorIntents.map((i) => ({
      intentId: i.intentId,
      kind: i.kind,
      decision: i.decision,
      reasons: i.reasons,
      modifiedNotionalUsd: i.modifiedNotionalUsd ? i.modifiedNotionalUsd.toString() : null,
    })),
    governorNotes: p.governorNotes,
    intentProposal: {
      id: p.intentProposal.id,
      intents: p.intentProposal.intents.map((i) => jsonSafe(i)),
    },
    actions: p.actions.map(actionJson),
    simulation: p.simulation,
    accounting: p.accounting,
    unwind: p.unwind,
    policy: p.policy,
    userApproval: p.userApproval,
  };
}

export function printJson(payload: unknown): string {
  return `${JSON.stringify(jsonSafe(payload), null, 2)}\n`;
}
