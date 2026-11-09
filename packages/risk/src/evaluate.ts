import type { Decimal } from '@shadow-banking/core';
import { hfBands, maxLeverage } from './bands.js';
import {
  MAX_EXECUTION_COST,
  MAX_LOOP_STEPS,
  MAX_SLIPPAGE_NORMAL,
  MAX_SLIPPAGE_STRESS,
  defaultConfig,
  type GovernorConfig,
} from './config.js';
import { tick, type TickOptions } from './machine.js';
import type {
  ActionIntent,
  ActionKind,
  Decision,
  EvaluationResult,
  IntentDecision,
  Proposal,
  RiskObservation,
  RiskState,
} from './types.js';

const INCREASING: ReadonlySet<ActionKind> = new Set(['borrow', 'open_hedge', 'stake', 'compound']);

export function isRiskIncreasing(intent: ActionIntent): boolean {
  if (intent.riskIncreasing === true) return true;
  if (intent.riskIncreasing === false) return false;
  if (intent.reducesRisk === true) return false;
  return INCREASING.has(intent.kind);
}

function permittedInState(intent: ActionIntent, state: RiskState): string | null {
  const increasing = isRiskIncreasing(intent);
  if (state !== 'Normal' && increasing) {
    return `action class ${intent.kind} is not permitted in ${state} (no new risk)`;
  }
  if (intent.kind === 'compound' && state !== 'Normal') {
    return 'compounding retained earnings is refused outside Normal';
  }
  if (state === 'Emergency' && intent.kind === 'rebalance' && intent.reducesRisk !== true) {
    return 'Emergency only allows rebalance as part of the unwind plan';
  }
  if (
    state === 'Deleveraging' &&
    intent.kind === 'rebalance' &&
    intent.reducesRisk !== true &&
    increasing
  ) {
    return 'Deleveraging only allows rebalance that reduces risk';
  }
  return null;
}

function decideIntent(
  intent: ActionIntent,
  obs: RiskObservation,
  state: RiskState,
  config: GovernorConfig,
): IntentDecision {
  const reasons: string[] = [];
  const increasing = isRiskIncreasing(intent);

  const gate = permittedInState(intent, state);
  if (gate) reasons.push(gate);

  if (config.killSwitch !== 'off' && increasing) {
    reasons.push(`kill switch ${config.killSwitch} blocks risk-increasing intents`);
  }

  if (obs.dataQuality !== 'fresh' && increasing) {
    reasons.push(`data quality ${obs.dataQuality}: fail closed on risk-increasing actions`);
  }

  const post = intent.expectedPostState;
  const bands = hfBands(obs.correlated, obs.smallPosition);
  const levCap = maxLeverage(obs.correlated);

  const postHf = post?.healthFactor ?? obs.healthFactor;
  if (increasing && postHf !== null && postHf.lt(bands.postActionMin)) {
    reasons.push(
      `post-action HF ${postHf.toFixed(4)} < minimum ${bands.postActionMin.toFixed(2)} (Normal + buffer${obs.smallPosition ? ', small-position' : ''})`,
    );
  }

  let postLev = post?.leverage ?? null;
  if (postLev === null && increasing && obs.equityUsd.gt(0)) {
    postLev = obs.grossAssetsUsd.plus(intent.notionalUsd).div(obs.equityUsd);
  }
  if (postLev !== null && postLev.gt(levCap)) {
    reasons.push(`post-action leverage ${postLev.toFixed(4)}x exceeds cap ${levCap.toFixed(1)}x`);
  }

  const postRc = post?.reserveCoverage;
  if (increasing && postRc !== null && postRc !== undefined && postRc.lt(1)) {
    reasons.push(`post-action reserve coverage ${postRc.toFixed(4)} < 1.0`);
  }

  const slipLimit =
    state === 'Normal' || state === 'Caution' ? MAX_SLIPPAGE_NORMAL : MAX_SLIPPAGE_STRESS;
  if (intent.maxSlippage !== undefined && intent.maxSlippage.gt(slipLimit)) {
    reasons.push(`max slippage ${intent.maxSlippage.toFixed(4)} > limit ${slipLimit.toFixed(4)}`);
  }

  if (
    intent.executionCostShare !== undefined &&
    intent.executionCostShare.gt(MAX_EXECUTION_COST) &&
    state !== 'Emergency'
  ) {
    reasons.push(
      `execution cost ${intent.executionCostShare.toFixed(4)} of notional > ${MAX_EXECUTION_COST.toFixed(2)}`,
    );
  }

  if (intent.loopSteps !== undefined && intent.loopSteps > MAX_LOOP_STEPS) {
    reasons.push(`recursive loop steps ${intent.loopSteps} > ${MAX_LOOP_STEPS}`);
  }

  if (intent.notionalUsd.gt(obs.envelopeUsd) || intent.notionalUsd.gt(config.envelopeUsd)) {
    reasons.push(
      `notional ${intent.notionalUsd.toFixed(2)} exceeds envelope ${config.envelopeUsd.toFixed(2)}`,
    );
  }

  if (increasing) {
    const ret = intent.expectedNetReturn;
    if (ret === undefined) {
      reasons.push('missing expected net return: hold liquid rather than add risk');
    } else if (ret.lt(obs.hurdle)) {
      reasons.push(
        `expected net ${ret.toFixed(4)} does not clear hurdle ${obs.hurdle.toFixed(4)} (hold liquid)`,
      );
    }
  }

  let decision: Decision = reasons.length > 0 ? 'reject' : 'approve';
  let modified: Decimal | undefined;

  if (
    decision === 'reject' &&
    increasing &&
    postLev !== null &&
    postLev.gt(levCap) &&
    obs.equityUsd.gt(0)
  ) {
    const maxGross = levCap.mul(obs.equityUsd);
    const room = maxGross.minus(obs.grossAssetsUsd);
    if (room.gt(0) && reasons.every((r) => r.includes('leverage'))) {
      decision = 'approve_modified';
      modified = room;
      reasons.push(`size reduced to ${room.toFixed(2)} to respect leverage cap`);
    }
  }

  const out: IntentDecision = {
    intentId: intent.id,
    kind: intent.kind,
    decision,
    reasons,
  };
  if (modified !== undefined) out.modifiedNotionalUsd = modified;
  return out;
}

export function evaluateProposal(
  obs: RiskObservation,
  proposal: Proposal | null,
  opts: TickOptions = {},
): EvaluationResult {
  const config = opts.config ?? defaultConfig();
  const ticked = tick(obs, { ...opts, config });
  const intents = (proposal?.intents ?? []).map((i) => decideIntent(i, obs, ticked.state, config));
  const anyReject = intents.some((i) => i.decision === 'reject');
  const anyMod = intents.some((i) => i.decision === 'approve_modified');
  let decision: Decision = 'approve';
  if (anyReject) decision = 'reject';
  else if (anyMod) decision = 'approve_modified';
  if (proposal === null) decision = ticked.veto ? 'reject' : 'approve';

  const veto = ticked.veto || decision === 'reject';
  const notes = [...ticked.notes];
  if (decision === 'reject' && proposal) {
    notes.push('Proposal rejected. Survival over yield; do not work around this veto.');
  }

  return {
    ...ticked,
    veto,
    notes,
    proposalId: proposal?.id ?? null,
    intents,
    decision,
  };
}
