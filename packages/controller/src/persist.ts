import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadLedger, saveLedger, type Ledger } from '@shadow-banking/accounting';
import { d } from '@shadow-banking/core';
import { hydrateMemory, type RiskMemory } from '@shadow-banking/risk';
import type { PaperRunConfig, PaperStepRecord } from './types.js';

export const PAPER_RUN_KIND = 'shadow-banking-paper-run';
export const PAPER_RUN_SCHEMA = 1;

export interface PersistedRun {
  kind: typeof PAPER_RUN_KIND;
  schemaVersion: number;
  paper: true;
  execution: 'forbidden';
  liveTransactions: false;
  signingKeys: false;
  config: {
    steps: number;
    seedUsd: string;
    hurdleApy: string;
    snapshotPath: string;
    provider: 'fixture' | 'live';
    network: string;
    lstSymbol: string;
    borrowSymbol: string;
    fundingBasis: string;
    clockUnit: string;
    stepDays: number;
    stateDir: string;
    reserveRate: string;
  };
  startedAt: string;
  endedAt: string;
  clockNow: string;
  posture: string;
  headline: string;
  veto: boolean;
  noDeployment: boolean;
  riskMemory: RiskMemory;
  steps: PaperStepRecord[];
}

function decStr(v: { toString(): string }): string {
  return v.toString();
}

function reviveStep(raw: PaperStepRecord | Record<string, unknown>): PaperStepRecord {
  const o = raw as Record<string, unknown>;
  return {
    ...(raw as PaperStepRecord),
    nav: d(String(o['nav'])),
    debt: d(String(o['debt'])),
    income: d(String(o['income'])),
    costs: d(String(o['costs'])),
    drawdown: d(String(o['drawdown'])),
  };
}

export function persistPaperRun(args: {
  stateDir: string;
  config: PaperRunConfig;
  ledger: Ledger;
  startedAt: string;
  endedAt: string;
  clockNow: string;
  posture: string;
  headline: string;
  veto: boolean;
  noDeployment: boolean;
  riskMemory: RiskMemory;
  steps: PaperStepRecord[];
}): { runPath: string; ledgerPath: string } {
  const dir = resolve(args.stateDir);
  mkdirSync(dir, { recursive: true });
  const ledgerPath = saveLedger(args.ledger, join(dir, 'ledger.json'));
  const doc: PersistedRun = {
    kind: PAPER_RUN_KIND,
    schemaVersion: PAPER_RUN_SCHEMA,
    paper: true,
    execution: 'forbidden',
    liveTransactions: false,
    signingKeys: false,
    config: {
      steps: args.config.steps,
      seedUsd: decStr(args.config.seedUsd),
      hurdleApy: decStr(args.config.hurdleApy),
      snapshotPath: args.config.snapshotPath,
      provider: args.config.provider,
      network: args.config.network,
      lstSymbol: args.config.lstSymbol,
      borrowSymbol: args.config.borrowSymbol,
      fundingBasis: args.config.fundingBasis,
      clockUnit: args.config.clockUnit,
      stepDays: args.config.stepDays,
      stateDir: dir,
      reserveRate: decStr(args.config.reserveRate),
    },
    startedAt: args.startedAt,
    endedAt: args.endedAt,
    clockNow: args.clockNow,
    posture: args.posture,
    headline: args.headline,
    veto: args.veto,
    noDeployment: args.noDeployment,
    riskMemory: args.riskMemory,
    steps: args.steps.map((s) => ({
      ...s,
      nav: decStr(s.nav) as unknown as PaperStepRecord['nav'],
      debt: decStr(s.debt) as unknown as PaperStepRecord['debt'],
      income: decStr(s.income) as unknown as PaperStepRecord['income'],
      costs: decStr(s.costs) as unknown as PaperStepRecord['costs'],
      drawdown: decStr(s.drawdown) as unknown as PaperStepRecord['drawdown'],
    })),
  };
  const runPath = join(dir, 'run.json');
  writeFileSync(runPath, `${JSON.stringify(doc, null, 2)}\n`);
  writeFileSync(
    join(dir, 'steps.jsonl'),
    args.steps
      .map((s) =>
        JSON.stringify({
          ...s,
          nav: decStr(s.nav),
          debt: decStr(s.debt),
          income: decStr(s.income),
          costs: decStr(s.costs),
          drawdown: decStr(s.drawdown),
        }),
      )
      .join('\n') + '\n',
  );
  return { runPath, ledgerPath };
}

export function loadPersistedRun(stateDir: string): {
  run: PersistedRun;
  ledger: Ledger;
  steps: PaperStepRecord[];
  riskMemory: RiskMemory;
} {
  const dir = resolve(stateDir);
  const runPath = join(dir, 'run.json');
  if (!existsSync(runPath)) throw new Error(`no paper run at ${runPath}`);
  const raw = JSON.parse(readFileSync(runPath, 'utf8')) as PersistedRun;
  if (raw.kind !== PAPER_RUN_KIND) throw new Error('not a paper run document');
  const ledger = loadLedger(join(dir, 'ledger.json'));
  return {
    run: raw,
    ledger,
    steps: (raw.steps ?? []).map(reviveStep),
    riskMemory: hydrateMemory(raw.riskMemory),
  };
}
