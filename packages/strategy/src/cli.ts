import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { d, parseDisclosureProfile } from '@shadow-banking/core';
import { resolveCapital } from './capital.js';
import { compareStrategies } from './compare.js';
import { composeStack } from './compose.js';
import { loadSnapshot, resolveMarket } from './market.js';
import { formatComparison, formatStack } from './report.js';
import { comparisonToJson, stackToJson } from './serialize.js';
import type { ComparisonInput, FundingBasis } from './types.js';

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function flag(args: string[], name: string): boolean {
  return args.includes(name);
}

function defaultSnapshotPath(): string | null {
  const p = resolve(process.cwd(), 'docs/data/market-snapshot-2026-10-21.json');
  return existsSync(p) ? p : null;
}

function usage(): string {
  return `Usage:
  pnpm strategy stack --snapshot docs/data/market-snapshot-2026-10-21.json --seed 1000
  pnpm strategy stack --snapshot <file> --seed 1000 --json --hurdle 0.10
  pnpm strategy compare --snapshot docs/data/market-snapshot-2026-10-21.json --seed 1000
  pnpm strategy compare --snapshot <file> --seed 1000 --json
  pnpm strategy compare --snapshot <file> --seed 1000 --hurdle 0.10 --reserve 0.20 --horizon 365
  pnpm strategy compare --snapshot <file> --seed 1000 --funding 30d|planning|current|stress
  pnpm strategy compare --snapshot <file> --seed 1000 --disclosure <profile.json>

stack: compose concurrent legs on the same equity (reserve, productive, collateral, borrow, redeploy, optional hedge).
compare: diagnostic single-strategy table (not the product identity).
Expected net = recurring income − financing − execution − expected losses.
Hold liquid = reserve-only stack. Default hurdle: 10% annualized net (configurable, not a promise).
`;
}

function parseFunding(raw: string | undefined): FundingBasis {
  if (!raw || raw === '30d' || raw === 'avg30d') return 'avg30d';
  if (raw === 'planning' || raw === 'current' || raw === 'stress') return raw;
  throw new Error(`--funding must be 30d|planning|current|stress; got ${raw}`);
}

function loadInput(args: string[]): ComparisonInput {
  const snapshotPath = arg(args, '--snapshot') ?? defaultSnapshotPath();
  if (!snapshotPath) throw new Error('pass --snapshot <file> (no default snapshot found)');
  const snapshot = loadSnapshot(snapshotPath);
  const seed = d(arg(args, '--seed') ?? '1000');
  const hurdle = d(arg(args, '--hurdle') ?? snapshot.hurdle ?? 0.1);
  const reserve = arg(args, '--reserve');
  const disclosurePath = arg(args, '--disclosure');
  const disclosure = disclosurePath
    ? parseDisclosureProfile(JSON.parse(readFileSync(disclosurePath, 'utf8')) as unknown)
    : undefined;
  const market = resolveMarket({
    snapshot,
    network: arg(args, '--network') ?? 'ethereum',
    lstSymbol: arg(args, '--collateral') ?? 'wstETH',
    borrowSymbol: arg(args, '--borrow') ?? 'WETH',
    seedUsd: seed,
    fundingBasis: parseFunding(arg(args, '--funding')),
    hurdleApy: hurdle,
  });
  const capital = resolveCapital({
    seedUsd: seed,
    hurdleApy: hurdle,
    ...(reserve !== undefined ? { reserveRate: d(reserve) } : {}),
    ...(disclosure ? { disclosure } : {}),
  });
  return {
    market,
    capital,
    hurdleApy: hurdle,
    horizonDays: Number(arg(args, '--horizon') ?? '365'),
    includeUnwindCosts: !flag(args, '--no-unwind'),
    hedgedLongShare: d(arg(args, '--hedged-long') ?? '0.60'),
    ...(disclosure ? { disclosure } : {}),
  };
}

function main(argv: string[]): number {
  const [, , cmd, ...args] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help') {
    process.stdout.write(usage());
    return 0;
  }
  if (cmd === 'stack' || cmd === 'compose') {
    const stack = composeStack(loadInput(args));
    const json = flag(args, '--json') || arg(args, '--format') === 'json';
    process.stdout.write(
      json ? `${JSON.stringify(stackToJson(stack), null, 2)}\n` : `${formatStack(stack)}\n`,
    );
    return 0;
  }
  if (cmd === 'compare') {
    const result = compareStrategies(loadInput(args));
    const json = flag(args, '--json') || arg(args, '--format') === 'json';
    process.stdout.write(
      json
        ? `${JSON.stringify(comparisonToJson(result), null, 2)}\n`
        : `${formatComparison(result)}\n`,
    );
    return 0;
  }
  process.stderr.write(usage());
  return 1;
}

const exit = main(process.argv);
if (exit !== 0) process.exit(exit);
