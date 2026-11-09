import {
  d,
  parseDisclosureProfile,
  type Decimal,
  type DisclosureProfile,
} from '@shadow-banking/core';
import type { ActionIntent, ActionKind, Proposal, RiskMemory, RiskState } from './types.js';

function obj(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function dec(value: unknown, label: string): Decimal {
  if (typeof value === 'number' || typeof value === 'string') return d(value);
  throw new Error(`${label} must be a number or numeric string`);
}

function optDec(value: unknown, label: string): Decimal | undefined {
  if (value === undefined || value === null) return undefined;
  return dec(value, label);
}

const KINDS: ReadonlySet<string> = new Set([
  'supply',
  'borrow',
  'repay',
  'withdraw',
  'swap',
  'stake',
  'open_hedge',
  'close_hedge',
  'add_margin',
  'add_collateral',
  'bridge',
  'transfer_to_reserve',
  'compound',
  'unwind',
  'hold',
  'rebalance',
]);

export function hydrateProposal(raw: unknown): Proposal {
  const o = obj(raw, 'proposal');
  const intentsRaw = o['intents'];
  if (!Array.isArray(intentsRaw)) throw new Error('proposal.intents must be an array');
  const intents: ActionIntent[] = intentsRaw.map((item, i) => {
    const x = obj(item, `intents[${i}]`);
    const kind = str(x['kind'], `intents[${i}].kind`);
    if (!KINDS.has(kind)) throw new Error(`unknown intent kind ${kind}`);
    const intent: ActionIntent = {
      id: str(x['id'] ?? `intent-${i}`, `intents[${i}].id`),
      kind: kind as ActionKind,
      notionalUsd: dec(x['notionalUsd'] ?? 0, `intents[${i}].notionalUsd`),
    };
    const venue = typeof x['venue'] === 'string' ? x['venue'] : undefined;
    if (venue) intent.venue = venue;
    const slip = optDec(x['maxSlippage'], 'maxSlippage');
    if (slip !== undefined) intent.maxSlippage = slip;
    const cost = optDec(x['executionCostShare'], 'executionCostShare');
    if (cost !== undefined) intent.executionCostShare = cost;
    const ret = optDec(x['expectedNetReturn'], 'expectedNetReturn');
    if (ret !== undefined) intent.expectedNetReturn = ret;
    if (typeof x['loopSteps'] === 'number') intent.loopSteps = x['loopSteps'];
    if (typeof x['riskIncreasing'] === 'boolean') intent.riskIncreasing = x['riskIncreasing'];
    if (typeof x['reducesRisk'] === 'boolean') intent.reducesRisk = x['reducesRisk'];
    if (x['expectedPostState'] !== undefined && x['expectedPostState'] !== null) {
      const p = obj(x['expectedPostState'], 'expectedPostState');
      const post: NonNullable<ActionIntent['expectedPostState']> = {};
      const hf = optDec(p['healthFactor'], 'healthFactor');
      const lev = optDec(p['leverage'], 'leverage');
      const rc = optDec(p['reserveCoverage'], 'reserveCoverage');
      if (hf !== undefined) post.healthFactor = hf;
      if (lev !== undefined) post.leverage = lev;
      if (rc !== undefined) post.reserveCoverage = rc;
      intent.expectedPostState = post;
    }
    return intent;
  });
  return { id: str(o['id'] ?? 'proposal', 'id'), intents };
}

export function hydrateMemory(raw: unknown): RiskMemory {
  const o = obj(raw, 'memory');
  const state = str(o['state'], 'state') as RiskState;
  const allowed: RiskState[] = ['Normal', 'Caution', 'Deleveraging', 'Emergency'];
  if (!allowed.includes(state)) throw new Error(`invalid risk state ${state}`);
  const mem: RiskMemory = {
    state,
    enteredAt: str(o['enteredAt'], 'enteredAt'),
    latchedEmergency: o['latchedEmergency'] === true,
  };
  if (typeof o['dailyPnlTriggerDay'] === 'string') mem.dailyPnlTriggerDay = o['dailyPnlTriggerDay'];
  return mem;
}

export function hydrateDisclosure(raw: unknown): DisclosureProfile {
  return parseDisclosureProfile(raw);
}
