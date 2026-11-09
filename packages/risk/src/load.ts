import { readFileSync } from 'node:fs';
import { d, type Decimal } from '@shadow-banking/core';
import type { GovernorSnapshot } from './compat.js';

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

export function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function looksLikeBalanceSheet(raw: unknown): boolean {
  if (raw === null || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return Array.isArray(o['holdings']) && Array.isArray(o['accounts']);
}

export function hydrateGovernorSnapshot(raw: unknown): GovernorSnapshot {
  const o = obj(raw, 'governor snapshot');
  const hf = o['healthFactor'];
  return {
    asOf: str(o['asOf'] ?? new Date().toISOString(), 'asOf'),
    navUsd: dec(o['navUsd'] ?? o['nav'], 'navUsd'),
    equityUsd: dec(o['equityUsd'] ?? o['equity'], 'equityUsd'),
    debtUsd: dec(o['debtUsd'] ?? o['debt'] ?? 0, 'debtUsd'),
    grossAssetsUsd: dec(
      o['grossAssetsUsd'] ?? o['assets'] ?? o['navUsd'] ?? o['nav'],
      'grossAssetsUsd',
    ),
    reserveHeldUsd: dec(o['reserveHeldUsd'] ?? o['reserves'] ?? 0, 'reserveHeldUsd'),
    reserveRequiredUsd: dec(
      o['reserveRequiredUsd'] ?? o['reserveRequired'] ?? 0,
      'reserveRequiredUsd',
    ),
    healthFactor: hf === null || hf === undefined || hf === 'n/a' ? null : dec(hf, 'healthFactor'),
    correlated: o['correlated'] === true || o['eMode'] === true,
    smallPosition: o['smallPosition'] === true,
    drawdown: dec(o['drawdown'] ?? 0, 'drawdown'),
    dailyPnl: dec(o['dailyPnl'] ?? 0, 'dailyPnl'),
    hurdle: dec(o['hurdle'] ?? '0.10', 'hurdle'),
    netCarry:
      o['netCarry'] === null || o['netCarry'] === undefined ? null : dec(o['netCarry'], 'netCarry'),
  };
}
