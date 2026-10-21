import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { d } from '@shadow-banking/core';
import { simulateLoop } from './loop.js';
import { buildPreset, listPresets, PRESET_IDS } from './presets.js';
import { formatCompare, formatStress, formatTable } from './report.js';
import { resultToJson } from './serialize.js';
import { loadMarketSnapshotFile, simulationInputFromSnapshot } from './snapshot.js';
import { runDefaultStresses } from './stress.js';
import type { LoopPolicy, SimulationInput } from './types.js';

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function flag(args: string[], name: string): boolean {
  return args.includes(name);
}

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

function usage(): string {
  return `Usage:
  pnpm sim presets
  pnpm sim run --preset <id> --seed 1000 [--loops optimal|N|ltv:0.8] [--reserve 0.2] [--horizon 365] [--hurdle 0.10] [--format table|json]
  pnpm sim run --snapshot docs/data/market-snapshot-<date>.json --network ethereum --collateral wstETH --borrow WETH --seed 1000
  pnpm sim compare --seed 1000
  pnpm sim stress --preset <id> --seed 1000

Presets: ${PRESET_IDS.join(', ')}

All printed APYs and ROEs are estimates from a dated snapshot, not realized returns.
`;
}

function applyCli(input: SimulationInput, args: string[]): SimulationInput {
  const seed = arg(args, '--seed');
  const reserve = arg(args, '--reserve');
  const horizon = arg(args, '--horizon');
  const hurdle = arg(args, '--hurdle');
  const loops = arg(args, '--loops');
  return {
    ...input,
    ...(seed ? { seedUsd: d(seed) } : {}),
    ...(reserve ? { reserveRate: d(reserve) } : {}),
    ...(horizon ? { horizonDays: Number(horizon) } : {}),
    ...(hurdle ? { stopping: { ...input.stopping, hurdleApy: d(hurdle) } } : {}),
    ...(loops ? { policy: parsePolicy(loops) } : {}),
  };
}

function loadInput(args: string[]): SimulationInput {
  const snapshotPath = arg(args, '--snapshot') ?? defaultSnapshotPath();
  const preset = arg(args, '--preset');
  const seed = d(arg(args, '--seed') ?? '1000');
  const reserve = d(arg(args, '--reserve') ?? '0.2');
  const horizon = Number(arg(args, '--horizon') ?? '365');
  if (arg(args, '--snapshot') || (snapshotPath && !preset)) {
    if (!snapshotPath) throw new Error('no snapshot file found');
    const snap = loadMarketSnapshotFile(snapshotPath);
    const input = simulationInputFromSnapshot({
      snapshot: snap,
      network: arg(args, '--network') ?? 'ethereum',
      collateralSymbol: arg(args, '--collateral') ?? 'wstETH',
      borrowSymbol: arg(args, '--borrow') ?? 'WETH',
      seedUsd: seed,
      reserveRate: reserve,
      horizonDays: horizon,
    });
    return applyCli(input, args);
  }
  const id = preset ?? 'aave-v3-ethereum-wsteth-eth-emode';
  return applyCli(
    buildPreset(id, {
      seedUsd: seed,
      reserveRate: reserve,
      horizonDays: horizon,
      loops: parsePolicy(arg(args, '--loops')),
      includeUnwindCosts: !flag(args, '--no-unwind'),
    }),
    args,
  );
}

function main(argv: string[]): number {
  const [, , cmd, ...args] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help') {
    process.stdout.write(usage());
    return 0;
  }
  if (cmd === 'presets') {
    for (const p of listPresets()) {
      process.stdout.write(`${p.id}\t${p.snapshotDate}\t${p.label}\n`);
    }
    return 0;
  }
  if (cmd === 'run') {
    const result = simulateLoop(loadInput(args));
    const format = arg(args, '--format') ?? 'table';
    process.stdout.write(
      format === 'json'
        ? `${JSON.stringify(resultToJson(result), null, 2)}\n`
        : `${formatTable(result)}\n`,
    );
    return 0;
  }
  if (cmd === 'compare') {
    const seed = d(arg(args, '--seed') ?? '1000');
    const ids = [
      'aave-v3-ethereum-wsteth-eth-emode',
      'aave-v3-arbitrum-wsteth-eth-emode',
      'aave-v3-base-wsteth-eth-emode',
    ] as const;
    const results = ids.map((id) => ({
      name: id,
      result: simulateLoop(buildPreset(id, { seedUsd: seed, loops: { kind: 'optimal' } })),
      looped: simulateLoop(buildPreset(id, { seedUsd: seed, loops: { kind: 'fixed', loops: 1 } })),
    }));
    process.stdout.write(formatCompare(results));
    process.stdout.write('\nFinding (estimates):\n');
    const [eth, arb] = results;
    if (eth && arb) {
      const e1 = eth.looped.steps[1];
      const a1 = arb.looped.steps[1];
      process.stdout.write(
        `  At a $1,000 seed, one extra loop's fixed transaction costs are ~${e1 ? e1.entryCostsUsd.toFixed(2) : '?'} USD on Ethereum vs ~${a1 ? a1.entryCostsUsd.toFixed(2) : '?'} USD on Arbitrum. Those costs are amortized over the horizon and dominate the ~0.26pp wstETH/ETH carry at this size, so extra loops usually fail the 10% hurdle on both venues; the L2 is cheaper but the spread is still too thin. Unlevered wstETH plus a USDC reserve is the typical recommendation.\n`,
      );
    }
    return 0;
  }
  if (cmd === 'stress') {
    const input = loadInput(args);
    const result = simulateLoop(input);
    process.stdout.write(`${formatTable(result)}\n\n`);
    process.stdout.write(formatStress(runDefaultStresses(input)));
    return 0;
  }
  process.stderr.write(usage());
  return 1;
}

const exit = main(process.argv);
if (exit !== 0) process.exit(exit);
