import { d } from '@shadow-banking/core';
import { hfBands, ldBands, maxLeverage } from './bands.js';
import { defaultConfig, type GovernorConfig } from './config.js';
import {
  allCleared,
  collectReadings,
  entryStateFromReadings,
  triggersFromReadings,
} from './readings.js';
import { hoursBetween, oneStepDown, rank, utcDay } from './state.js';
import type {
  MandatedIntent,
  RecommendedAction,
  RiskMemory,
  RiskObservation,
  RiskState,
  TickResult,
} from './types.js';

export interface TickOptions {
  config?: GovernorConfig;
  memory?: RiskMemory;
  now?: string;
  humanAck?: boolean;
  unwindComplete?: boolean;
  noDeployment?: boolean;
}

function actionFor(state: RiskState, noDeployment: boolean): RecommendedAction {
  if (state === 'Emergency') return 'unwind';
  if (state === 'Deleveraging') return 'deleverage';
  if (state === 'Caution') return 'add_reserves';
  return noDeployment ? 'hold_liquid' : 'operate_paper';
}

function mandatedFor(state: RiskState, triggers: TickResult['triggers']): MandatedIntent[] {
  if (state === 'Emergency') {
    return [{ kind: 'unwind', reason: 'Emergency: safest feasible unwind to liquid form.' }];
  }
  if (state === 'Deleveraging') {
    const out: MandatedIntent[] = [
      { kind: 'repay', reason: 'Deleveraging: repay debt / reduce exposure until Normal+margin.' },
    ];
    if (triggers.some((t) => t.metric === 'reserveCoverage')) {
      out.push({ kind: 'transfer_to_reserve', reason: 'Restore reserve coverage RC ≥ 1.0.' });
    }
    if (
      triggers.some((t) => t.metric.startsWith('healthFactor') || t.metric.startsWith('ldLend'))
    ) {
      out.push({ kind: 'add_collateral', reason: 'Add collateral or repay to restore HF/LD.' });
    }
    return out;
  }
  return [];
}

function notesFor(state: RiskState, veto: boolean, noDeployment: boolean): string[] {
  const notes = [
    'Rules from docs/risk-governor.md §3–§4 (starting simulation values). Paper / read-only.',
    'Survival over yield. A veto cannot be overridden by this CLI or by an AI layer.',
  ];
  if (noDeployment) {
    notes.push(
      'noDeployment: preserve capital in liquid form. Do not open new strategies or increase leverage.',
    );
  }
  if (veto) {
    notes.push(
      'RISK VETO: the governor rejects risk-increasing actions. The AI must not work around this.',
    );
  }
  if (state === 'Emergency') {
    notes.push('Emergency is latched until a human acknowledgement after positions are safe.');
  }
  return notes;
}

export function initialMemory(asOf: string): RiskMemory {
  return { state: 'Normal', enteredAt: asOf, latchedEmergency: false };
}

export function tick(obs: RiskObservation, opts: TickOptions = {}): TickResult {
  const config = opts.config ?? defaultConfig();
  const now = opts.now ?? obs.asOf;
  const previous = opts.memory ?? initialMemory(obs.asOf);
  const readings = collectReadings(obs, config);
  const desired = entryStateFromReadings(readings);
  const triggers = triggersFromReadings(readings);
  const dwell = d(hoursBetween(previous.enteredAt, now).toFixed(6));

  let next: RiskState = previous.state;
  let latched = previous.latchedEmergency;
  const hardLatch = readings.some((r) => r.latched && r.entryState === 'Emergency');

  if (hardLatch || desired === 'Emergency') {
    next = 'Emergency';
    if (hardLatch) latched = true;
  } else if (latched && !opts.humanAck) {
    next = 'Emergency';
  } else if (rank(desired) > rank(previous.state)) {
    next = desired;
  } else if (rank(desired) < rank(previous.state)) {
    const from = previous.state;
    if (from === 'Emergency') {
      const safe = allCleared(readings, 'Emergency') || opts.unwindComplete === true;
      if (opts.humanAck && safe) {
        next = 'Deleveraging';
        latched = false;
      } else {
        next = 'Emergency';
      }
    } else if (from === 'Deleveraging') {
      const dwellOk = dwell.gte(config.deleveragingDwellHours);
      if (dwellOk && allCleared(readings, 'Deleveraging')) next = 'Caution';
      else next = 'Deleveraging';
    } else if (from === 'Caution') {
      const dwellOk = dwell.gte(config.cautionDwellHours);
      if (dwellOk && allCleared(readings, 'Caution')) next = 'Normal';
      else next = 'Caution';
    } else {
      next = 'Normal';
    }
    if (rank(next) < rank(from) - 1) next = oneStepDown(from);
  } else {
    next = previous.state;
  }

  if (next === 'Emergency' && hardLatch) latched = true;

  const enteredAt = next === previous.state ? previous.enteredAt : now;
  const dailyDay = utcDay(obs.asOf);
  const memory: RiskMemory = {
    state: next,
    enteredAt,
    latchedEmergency: latched,
  };
  if (triggers.some((t) => t.metric === 'dailyPnl' && t.state !== 'Normal')) {
    memory.dailyPnlTriggerDay = previous.dailyPnlTriggerDay ?? dailyDay;
  }

  const noDeployment = opts.noDeployment === true || next !== 'Normal';
  const veto = next === 'Deleveraging' || next === 'Emergency';
  const bands = hfBands(obs.correlated, obs.smallPosition);
  const transition =
    next === previous.state
      ? `hold ${next}`
      : rank(next) > rank(previous.state)
        ? `${previous.state} → ${next} (entry, skip allowed)`
        : `${previous.state} → ${next} (hysteresis + dwell)`;

  return {
    asOf: obs.asOf,
    state: next,
    previousState: previous.state,
    veto,
    recommendedAction: actionFor(next, noDeployment),
    noDeployment,
    hurdle: obs.hurdle,
    metrics: obs,
    triggers,
    limits: {
      maxLeverage: maxLeverage(obs.correlated),
      hfCaution: bands.caution,
      hfDeleveraging: bands.delev,
      hfEmergency: bands.emerg,
      postActionMinHf: bands.postActionMin,
      ldCaution: ldBands(obs.smallPosition).caution,
      smallPosition: obs.smallPosition,
      correlated: obs.correlated,
    },
    notes: notesFor(next, veto, noDeployment),
    mandated: mandatedFor(next, triggers),
    memory,
    dwellHours: next === previous.state ? dwell : d(0),
    transition,
  };
}
