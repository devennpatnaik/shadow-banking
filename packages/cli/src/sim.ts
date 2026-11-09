import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { d } from '@shadow-banking/core';
import {
  buildPreset,
  listPresets,
  loadMarketSnapshotFile,
  PRESET_IDS,
  resultToJson,
  runDefaultStresses,
  simulateLoop,
  simulationInputFromSnapshot,
  formatCompare,
  formatStress,
  formatTable,
  type LoopPolicy,
  type SimulationInput,
  type SimulationResult,
} from '@shadow-banking/simulator';
import { flagOn, flagValue } from './parse.js';

function parsePolicy(raw: string | undefined): LoopPolicy {
  if (!raw || raw === 'optimal') return { kind: 'optimal' };
  if (raw.startsWith('ltv:')) return { kind: 'targetLtv', targetLtv: d(raw.slice(4)) };
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0) return { kind: 'fixed', loops: n };
  throw new Error(`--loops must be "optimal", a count, or "ltv:0.80"; got ${raw}`);
}

function defaultSnapshotPath(): string | null {
  const p = resolve(process.cwd(), 'docs/data/market-snapshot-2026-10-21.json');
  return existsSync(p) ? p : null;
}

function applyFlags(input: SimulationInput, flags: Record<string, string | true>): SimulationInput {
  const seed = flagValue(flags, '--seed');
  const reserve = flagValue(flags, '--reserve');
  const horizon = flagValue(flags, '--horizon');
  const hurdle = flagValue(flags, '--hurdle');
  const loops = flagValue(flags, '--loops');
  return {
    ...input,
    ...(seed ? { seedUsd: d(seed) } : {}),
    ...(reserve ? { reserveRate: d(reserve) } : {}),
    ...(horizon ? { horizonDays: Number(horizon) } : {}),
    ...(hurdle ? { stopping: { ...input.stopping, hurdleApy: d(hurdle) } } : {}),
    ...(loops ? { policy: parsePolicy(loops) } : {}),
  };
}

export function loadSimInput(flags: Record<string, string | true>): SimulationInput {
  const snapshotFlag = flagValue(flags, '--snapshot');
  const snapshotPath = snapshotFlag ?? defaultSnapshotPath();
  const preset = flagValue(flags, '--preset');
  const seed = d(flagValue(flags, '--seed') ?? '1000');
  const reserve = d(flagValue(flags, '--reserve') ?? '0.2');
  const horizon = Number(flagValue(flags, '--horizon') ?? '365');
  if (snapshotFlag || (snapshotPath && !preset)) {
    if (!snapshotPath) throw new Error('no snapshot file found');
    const snap = loadMarketSnapshotFile(snapshotPath);
    const input = simulationInputFromSnapshot({
      snapshot: snap,
      network: flagValue(flags, '--network') ?? 'ethereum',
      collateralSymbol: flagValue(flags, '--collateral') ?? 'wstETH',
      borrowSymbol: flagValue(flags, '--borrow') ?? 'WETH',
      seedUsd: seed,
      reserveRate: reserve,
      horizonDays: horizon,
    });
    return applyFlags(input, flags);
  }
  const id = preset ?? 'aave-v3-ethereum-wsteth-eth-emode';
  return applyFlags(
    buildPreset(id, {
      seedUsd: seed,
      reserveRate: reserve,
      horizonDays: horizon,
      loops: parsePolicy(flagValue(flags, '--loops')),
      includeUnwindCosts: !flagOn(flags, '--no-unwind'),
    }),
    flags,
  );
}

export function simEnvelope(result: SimulationResult, extra: Record<string, unknown> = {}) {
  const rec = result.recommendation;
  const noDeployment = rec.action === 'hold-liquid' || !rec.clearsHurdle;
  return {
    ok: true,
    command: 'sim' as const,
    source: '@shadow-banking/simulator',
    noDeployment,
    recommendedAction: noDeployment ? 'hold_liquid' : 'operate_paper',
    figures: 'estimates',
    ...extra,
    result: resultToJson(result),
  };
}

export {
  listPresets,
  PRESET_IDS,
  formatCompare,
  formatStress,
  formatTable,
  simulateLoop,
  buildPreset,
  runDefaultStresses,
  resultToJson,
};
