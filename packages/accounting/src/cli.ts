import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { d } from '@shadow-banking/core';
import { recommendRetainedEarnings, type AllocatorInput } from './allocate.js';
import { buildSeed1kFixture } from './fixture.js';
import { loadLedger, saveLedger } from './persist.js';
import { buildPerformanceReport } from './performance.js';
import { formatAllocator, formatLedger, formatPerformance } from './report.js';
import { allocatorToJson, ledgerToJson, reportToJson } from './serialize.js';
import type { Ledger } from './ledger.js';
import type { RiskStateName } from './types.js';

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function flag(args: string[], name: string): boolean {
  return args.includes(name);
}

function bundledFixturePath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/seed-1k.json');
}

function usage(): string {
  return `Usage:
  pnpm accounting report [--ledger <path>] [--json] [--hurdle 0.10]
  pnpm accounting ledger [--ledger <path>] [--json]
  pnpm accounting allocate [--ledger <path>] [--risk-state Normal|Caution|Deleveraging|Emergency] [--json]
  pnpm accounting init --fixture seed-1k --out <file-or-dir>

Default ledger is the bundled $1,000 seed fixture when --ledger is omitted.
Amounts are decimal strings in JSON. Persistence format is documented in packages/accounting/README.md.

NAV = assets − liabilities. Borrowed principal is not income. Inter-account transfers are not profit.
Annualized yield is an ESTIMATE. The 10% hurdle is evaluation-only.
`;
}

function load(args: string[]): Ledger {
  const p = arg(args, '--ledger');
  if (!p) {
    const bundled = bundledFixturePath();
    if (existsSync(bundled)) return loadLedger(bundled);
    return buildSeed1kFixture();
  }
  return loadLedger(p);
}

function jsonMode(args: string[]): boolean {
  return flag(args, '--json') || arg(args, '--format') === 'json';
}

function allocatorInput(ledger: Ledger, args: string[]): AllocatorInput {
  const report = buildPerformanceReport(ledger);
  const risk = (arg(args, '--risk-state') ?? 'Normal') as RiskStateName;
  const allowed: RiskStateName[] = ['Normal', 'Caution', 'Deleveraging', 'Emergency'];
  if (!allowed.includes(risk)) throw new Error(`--risk-state must be one of ${allowed.join(', ')}`);
  const reserveRate = d(arg(args, '--reserve') ?? '0.20');
  return {
    netEarnings: report.realizedPnl,
    riskState: risk,
    nav: report.nav,
    debt: report.totalDebt,
    liquidReserves: report.liquidReserves,
    reserveRequired: report.nav.mul(reserveRate),
    upcomingExpenses: d(arg(args, '--expenses') ?? '0'),
    liquidationDistance: report.liquidationExposure.worstLiquidationDistance,
    hurdleApy: report.hurdleApy,
    estimatedNetYieldApy:
      report.netAnnualizedYieldKind === 'estimate' ? report.netAnnualizedYield : null,
  };
}

function main(argv: string[]): number {
  const [, , cmd, ...args] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help') {
    process.stdout.write(usage());
    return 0;
  }
  if (cmd === 'init') {
    const fixture = arg(args, '--fixture') ?? 'seed-1k';
    if (fixture !== 'seed-1k') throw new Error(`unknown fixture ${fixture}`);
    const out = arg(args, '--out');
    if (!out) throw new Error('--out is required');
    const ledger = buildSeed1kFixture();
    const saved = saveLedger(ledger, out);
    process.stdout.write(`wrote ${saved}\n`);
    return 0;
  }
  if (cmd === 'report') {
    const ledger = load(args);
    const hurdle = arg(args, '--hurdle');
    const report = buildPerformanceReport(ledger, hurdle ? d(hurdle) : undefined);
    process.stdout.write(
      jsonMode(args)
        ? `${JSON.stringify(reportToJson(report), null, 2)}\n`
        : `${formatPerformance(report)}\n`,
    );
    return 0;
  }
  if (cmd === 'ledger') {
    const ledger = load(args);
    process.stdout.write(
      jsonMode(args)
        ? `${JSON.stringify(ledgerToJson(ledger), null, 2)}\n`
        : `${formatLedger(ledger)}\n`,
    );
    return 0;
  }
  if (cmd === 'allocate') {
    const ledger = load(args);
    const result = recommendRetainedEarnings(allocatorInput(ledger, args));
    process.stdout.write(
      jsonMode(args)
        ? `${JSON.stringify(allocatorToJson(result), null, 2)}\n`
        : `${formatAllocator(result)}\n`,
    );
    return 0;
  }
  process.stderr.write(usage());
  return 1;
}

const exit = main(process.argv);
if (exit !== 0) process.exit(exit);
