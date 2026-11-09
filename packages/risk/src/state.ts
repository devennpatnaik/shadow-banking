import type { RiskState } from './types.js';

const ORDER: readonly RiskState[] = ['Normal', 'Caution', 'Deleveraging', 'Emergency'];

export function rank(state: RiskState): number {
  return ORDER.indexOf(state);
}

export function worse(a: RiskState, b: RiskState): RiskState {
  return rank(a) >= rank(b) ? a : b;
}

export function oneStepDown(state: RiskState): RiskState {
  const i = rank(state);
  if (i <= 0) return 'Normal';
  return ORDER[i - 1] ?? 'Normal';
}

export function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

export function hoursBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, (b - a) / 3_600_000);
}
