import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  allocatorToJson,
  buildPerformanceReport,
  buildSeed1kFixture,
  formatAllocator,
  formatLedger,
  formatPerformance,
  ledgerToJson,
  loadLedger,
  recommendRetainedEarnings,
  reportToJson,
  saveLedger,
  type AllocatorInput,
  type Ledger,
  type RiskStateName,
} from '@shadow-banking/accounting';
import { d, parseDisclosureProfile } from '@shadow-banking/core';
import {
  compareStrategies,
  comparisonToJson,
  composeStack,
  formatComparison,
  formatStack,
  loadSnapshot,
  resolveCapital,
  resolveMarket,
  stackToJson,
  type FundingBasis,
} from '@shadow-banking/strategy';
import { banner } from './format.js';
import { EXIT_ERROR, EXIT_OK, type Io } from './io.js';
import { writeOut } from './json.js';
import { flagOn, flagValue, type ParsedArgs } from './parse.js';

function defaultSnapshotPath(): string | null {
  const p = resolve(process.cwd(), 'docs/data/market-snapshot-2026-10-21.json');
  return existsSync(p) ? p : null;
}

function parseFunding(raw: string | undefined): FundingBasis {
  if (!raw || raw === '30d' || raw === 'avg30d') return 'avg30d';
  if (raw === 'planning' || raw === 'current' || raw === 'stress') return raw;
  throw new Error(`--funding must be 30d|planning|current|stress; got ${raw}`);
}

function strategyUsage(): string {
  return `Usage:
  pnpm sb stack --snapshot docs/data/market-snapshot-2026-10-21.json --seed 1000 [--json]
  pnpm sb strategy stack --seed 1000 --json
  pnpm sb strategy compare --snapshot docs/data/market-snapshot-2026-10-21.json --seed 1000
  pnpm sb strategy --json

Wraps @shadow-banking/strategy. Default subcommand is stack.
compare is a diagnostic single-strategy table.
Hold liquid = reserve-only stack. Hurdle 10% annualized net, configurable.`;
}

function accountingUsage(): string {
  return `Usage:
  pnpm sb accounting report [--ledger <path>] [--json]
  pnpm sb accounting ledger [--ledger <path>] [--json]
  pnpm sb accounting allocate [--ledger <path>] [--risk-state Normal|Caution|Deleveraging|Emergency] [--json]
  pnpm sb accounting init --fixture seed-1k --out <file-or-dir>

Wraps @shadow-banking/accounting. Default subcommand is report.
NAV = assets − liabilities. Borrowed principal is not income.
Annualized yield is an ESTIMATE.`;
}

function loadStrategyInput(args: ParsedArgs) {
  const snapshotPath = flagValue(args.flags, '--snapshot') ?? defaultSnapshotPath();
  if (!snapshotPath) throw new Error('pass --snapshot <file> (no default snapshot found)');
  const snapshot = loadSnapshot(snapshotPath);
  const seed = d(flagValue(args.flags, '--seed') ?? '1000');
  const hurdle = d(flagValue(args.flags, '--hurdle') ?? snapshot.hurdle ?? 0.1);
  const reserve = flagValue(args.flags, '--reserve');
  const disclosurePath = flagValue(args.flags, '--disclosure');
  const disclosure = disclosurePath
    ? parseDisclosureProfile(JSON.parse(readFileSync(disclosurePath, 'utf8')) as unknown)
    : undefined;
  const market = resolveMarket({
    snapshot,
    network: flagValue(args.flags, '--network') ?? 'ethereum',
    lstSymbol: flagValue(args.flags, '--collateral') ?? 'wstETH',
    borrowSymbol: flagValue(args.flags, '--borrow') ?? 'WETH',
    seedUsd: seed,
    fundingBasis: parseFunding(flagValue(args.flags, '--funding')),
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
    horizonDays: Number(flagValue(args.flags, '--horizon') ?? '365'),
    includeUnwindCosts: !flagOn(args.flags, '--no-unwind'),
    hedgedLongShare: d(flagValue(args.flags, '--hedged-long') ?? '0.60'),
    ...(disclosure ? { disclosure } : {}),
  };
}

export function cmdStrategy(io: Io, args: ParsedArgs): number {
  const sub = args.rest[0] ?? 'stack';
  if (sub === 'help') {
    writeOut(
      io,
      args.json,
      {
        ok: true,
        command: 'strategy',
        stub: false,
        source: '@shadow-banking/strategy',
        usage: strategyUsage(),
      },
      strategyUsage(),
    );
    return EXIT_OK;
  }
  if (sub === 'compare') {
    const result = compareStrategies(loadStrategyInput(args));
    const preserve = result.recommendation.action === 'preserve-capital';
    const payload = {
      ok: true,
      command: 'strategy',
      stub: false,
      source: '@shadow-banking/strategy',
      noDeployment: preserve,
      recommendedAction: preserve ? 'hold_liquid' : 'paper_model_only',
      clearsHurdle: result.recommendation.clearsHurdle,
      result: comparisonToJson(result),
    };
    writeOut(
      io,
      args.json,
      payload,
      banner('Strategy (diagnostic)', '@shadow-banking/strategy') + '\n' + formatComparison(result),
    );
    return EXIT_OK;
  }

  if (sub !== 'stack' && sub !== 'compose') {
    io.stderr.write(`unknown strategy subcommand "${sub}"\n\n${strategyUsage()}\n`);
    return EXIT_ERROR;
  }

  const stack = composeStack(loadStrategyInput(args));
  const payload = {
    ok: true,
    command: args.command === 'stack' ? 'stack' : 'strategy',
    stub: false,
    source: '@shadow-banking/strategy',
    noDeployment: stack.noDeployment,
    recommendedAction: stack.recommendedAction,
    clearsHurdle: stack.clearsHurdle,
    result: stackToJson(stack),
  };
  writeOut(
    io,
    args.json,
    payload,
    banner('Capital stack', '@shadow-banking/strategy') + '\n' + formatStack(stack),
  );
  return EXIT_OK;
}

function loadAccountingLedger(args: ParsedArgs): Ledger {
  const p = flagValue(args.flags, '--ledger');
  if (!p) return buildSeed1kFixture();
  return loadLedger(p);
}

function allocatorInput(ledger: Ledger, args: ParsedArgs): AllocatorInput {
  const report = buildPerformanceReport(ledger);
  const risk = (flagValue(args.flags, '--risk-state') ?? 'Normal') as RiskStateName;
  const allowed: RiskStateName[] = ['Normal', 'Caution', 'Deleveraging', 'Emergency'];
  if (!allowed.includes(risk)) throw new Error(`--risk-state must be one of ${allowed.join(', ')}`);
  const reserveRate = d(flagValue(args.flags, '--reserve') ?? '0.20');
  return {
    netEarnings: report.realizedPnl,
    riskState: risk,
    nav: report.nav,
    debt: report.totalDebt,
    liquidReserves: report.liquidReserves,
    reserveRequired: report.nav.mul(reserveRate),
    upcomingExpenses: d(flagValue(args.flags, '--expenses') ?? '0'),
    liquidationDistance: report.liquidationExposure.worstLiquidationDistance,
    hurdleApy: report.hurdleApy,
    estimatedNetYieldApy:
      report.netAnnualizedYieldKind === 'estimate' ? report.netAnnualizedYield : null,
  };
}

export function cmdAccounting(io: Io, args: ParsedArgs): number {
  const sub = args.rest[0] ?? 'report';
  if (sub === 'help') {
    writeOut(
      io,
      args.json,
      {
        ok: true,
        command: 'accounting',
        stub: false,
        source: '@shadow-banking/accounting',
        usage: accountingUsage(),
      },
      accountingUsage(),
    );
    return EXIT_OK;
  }
  if (sub === 'init') {
    const fixture = flagValue(args.flags, '--fixture') ?? 'seed-1k';
    if (fixture !== 'seed-1k') throw new Error(`unknown fixture ${fixture}`);
    const out = flagValue(args.flags, '--out');
    if (!out) throw new Error('--out is required');
    const saved = saveLedger(buildSeed1kFixture(), out);
    writeOut(
      io,
      args.json,
      {
        ok: true,
        command: 'accounting',
        stub: false,
        source: '@shadow-banking/accounting',
        subcommand: 'init',
        wrote: saved,
      },
      `wrote ${saved}`,
    );
    return EXIT_OK;
  }
  if (sub === 'report') {
    const ledger = loadAccountingLedger(args);
    const hurdle = flagValue(args.flags, '--hurdle');
    const report = buildPerformanceReport(ledger, hurdle ? d(hurdle) : undefined);
    const payload = {
      ok: true,
      command: 'accounting',
      stub: false,
      source: '@shadow-banking/accounting',
      subcommand: 'report',
      nav: report.nav.toString(),
      result: reportToJson(report),
    };
    writeOut(
      io,
      args.json,
      payload,
      banner('Accounting', '@shadow-banking/accounting') + '\n' + formatPerformance(report),
    );
    return EXIT_OK;
  }
  if (sub === 'ledger') {
    const ledger = loadAccountingLedger(args);
    const payload = {
      ok: true,
      command: 'accounting',
      stub: false,
      source: '@shadow-banking/accounting',
      subcommand: 'ledger',
      result: ledgerToJson(ledger),
    };
    writeOut(
      io,
      args.json,
      payload,
      banner('Accounting', '@shadow-banking/accounting') + '\n' + formatLedger(ledger),
    );
    return EXIT_OK;
  }
  if (sub === 'allocate') {
    const ledger = loadAccountingLedger(args);
    const result = recommendRetainedEarnings(allocatorInput(ledger, args));
    const payload = {
      ok: true,
      command: 'accounting',
      stub: false,
      source: '@shadow-banking/accounting',
      subcommand: 'allocate',
      result: allocatorToJson(result),
    };
    writeOut(
      io,
      args.json,
      payload,
      banner('Accounting', '@shadow-banking/accounting') + '\n' + formatAllocator(result),
    );
    return EXIT_OK;
  }
  io.stderr.write(`unknown accounting subcommand "${sub}"\n\n${accountingUsage()}\n`);
  return EXIT_ERROR;
}
