import { Decimal, toJsonNumber } from '@shadow-banking/core';
import type { Io } from './io.js';

export const PAPER_ENVELOPE = {
  paper: true as const,
  execution: 'forbidden' as const,
  phase: '1-4' as const,
  signingKeys: false as const,
  liveTransactions: false as const,
};

export function jsonSafe(value: unknown): unknown {
  if (value instanceof Decimal) return toJsonNumber(value);
  if (value === null || value === undefined) return value ?? null;
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

export function printJson(payload: unknown): string {
  return `${JSON.stringify(jsonSafe(payload), null, 2)}\n`;
}

export function writeOut(io: Io, json: boolean, payload: object, text: string): void {
  io.stdout.write(
    json ? printJson({ ...PAPER_ENVELOPE, ...(payload as Record<string, unknown>) }) : `${text}\n`,
  );
}
