import { buildPerformanceReport, type Ledger } from '@shadow-banking/accounting';
import { d, formatMoney, type Decimal } from '@shadow-banking/core';
import {
  defaultConfig,
  evaluateProposal,
  initialMemory,
  observationFromBook,
  paperDisclosure,
  type EvaluationResult,
  type Proposal,
  type RiskMemory,
} from '@shadow-banking/risk';
import { loadSnapshot, type ComparisonResult } from '@shadow-banking/strategy';
import { accruePaperDay, applyApprovedPaperActions, hasDeployedPositions } from './apply.js';
import { addUtcDays, dateToIso } from './clock.js';
import { evaluatePaperStrategies } from './evaluate-strategies.js';
import { defaultStateDir, defaultSnapshotPath, resolveSnapshotPath } from './paths.js';
import { persistPaperRun } from './persist.js';
import { proposeFromComparison } from './propose.js';
import { seedIdlePaperLedger } from './seed.js';
import type { PaperLoopInput, PaperRunConfig, PaperRunResult, PaperStepRecord } from './types.js';

function headlineOf(args: {
  seedUsd: Decimal;
  steps: number;
  posture: 'hold_liquid' | 'deployed';
  strategyId: string;
  nav: Decimal;
  debt: Decimal;
  veto: boolean;
}): string {
  const posture = args.posture === 'hold_liquid' ? 'HOLD LIQUID' : `DEPLOYED (${args.strategyId})`;
  const veto = args.veto ? 'VETO' : 'no veto';
  return `Paper · ${formatMoney(args.seedUsd)} · ${args.steps} steps · ${posture} · NAV ${formatMoney(args.nav)} · debt ${formatMoney(args.debt)} · ${veto}`;
}

export function runPaper(input: PaperLoopInput): PaperRunResult {
  const rootSnapshot = resolveSnapshotPath(input.snapshotPath);
  const snapshot = loadSnapshot(rootSnapshot);
  const hurdle = input.hurdleApy ?? d(snapshot.hurdle ?? 0.1);
  const seedUsd = input.seedUsd;
  const reserveRate = input.reserveRate ?? d('0.20');
  const stepDays = input.stepDays ?? 1;
  const startedAt = input.now ?? dateToIso(snapshot.snapshotDate);
  const stateDir = input.stateDir ?? defaultStateDir();
  const config: PaperRunConfig = {
    steps: input.steps,
    seedUsd,
    hurdleApy: hurdle,
    snapshotPath: rootSnapshot,
    provider: input.provider ?? 'fixture',
    network: input.network ?? 'ethereum',
    lstSymbol: input.lstSymbol ?? 'wstETH',
    borrowSymbol: input.borrowSymbol ?? 'WETH',
    fundingBasis: input.fundingBasis ?? 'avg30d',
    clockUnit: input.clockUnit ?? 'day',
    stepDays,
    stateDir,
    reserveRate,
  };

  const ledger: Ledger =
    input.ledger ??
    seedIdlePaperLedger({
      asOf: startedAt,
      seedUsd,
      hurdleApy: hurdle,
      reserveRate,
    });
  let memory: RiskMemory = initialMemory(startedAt);
  const disclosure = paperDisclosure();
  const steps: PaperStepRecord[] = [];
  let lastComparison: ComparisonResult | null = null;
  let lastEvaluation: EvaluationResult | null = null;
  let prevNav = ledger.nav();

  for (let i = 1; i <= config.steps; i++) {
    const at = addUtcDays(startedAt, (i - 1) * stepDays);
    if (i > 1) {
      accruePaperDay({
        at,
        ledger,
        days: stepDays,
        lstYieldApy: d(snapshot.assets.find((a) => a.symbol === 'wstETH')?.yieldApy ?? 0),
        usdcSupplyApy: d(
          snapshot.markets
            .filter((m) => m.asset === 'USDC' && m.supplyApy != null)
            .reduce((best, m) => Math.max(best, m.supplyApy ?? 0), 0),
        ),
      });
    }

    const comparison = evaluatePaperStrategies({
      snapshot,
      seedUsd,
      hurdleApy: hurdle,
      network: config.network,
      lstSymbol: config.lstSymbol,
      borrowSymbol: config.borrowSymbol,
      fundingBasis: config.fundingBasis,
      reserveRate,
      disclosure,
      ledger,
    });
    lastComparison = comparison;
    const noDeployment =
      comparison.recommendation.action === 'preserve-capital' ||
      !comparison.recommendation.clearsHurdle;
    const perf = buildPerformanceReport(ledger, hurdle);
    const dailyPnl = ledger.nav().minus(prevNav);
    const book = ledger.toBalanceSheet(at);
    const obs = observationFromBook(book, disclosure, {
      hurdle,
      drawdown: perf.maxDrawdown.abs(),
      dailyPnl,
    });
    let proposal: Proposal = proposeFromComparison({
      comparison,
      riskState: memory.state,
      step: i,
      alreadyDeployed: hasDeployedPositions(ledger),
    });
    if (input.mutateProposal) proposal = input.mutateProposal(proposal, { step: i });

    const evaluation = evaluateProposal(obs, proposal, {
      memory,
      now: at,
      noDeployment,
      config: defaultConfig({ hurdleApy: hurdle }),
    });
    lastEvaluation = evaluation;
    memory = evaluation.memory;

    const beforeDebt = ledger.totalDebt();
    const apply = applyApprovedPaperActions({
      at,
      ledger,
      proposal,
      evaluation,
      comparison,
      lstPrice: d(snapshot.assets.find((a) => a.symbol === 'wstETH')?.priceUsd ?? 0),
      borrowApr: d(
        snapshot.markets.find((m) => m.asset === 'WETH' && m.network === config.network)
          ?.borrowApy ?? 0,
      ),
    });
    if (evaluation.veto && ledger.totalDebt().gt(beforeDebt)) {
      throw new Error('paper invariant: vetoed borrow was posted');
    }

    const after = buildPerformanceReport(ledger, hurdle);
    const posture = hasDeployedPositions(ledger) ? 'deployed' : 'hold_liquid';
    const record: PaperStepRecord = {
      step: i,
      at,
      snapshotDate: snapshot.snapshotDate,
      posture,
      strategyId: comparison.recommendation.strategyId,
      recommendedAction: evaluation.recommendedAction,
      noDeployment: evaluation.noDeployment || noDeployment,
      clearsHurdle: comparison.recommendation.clearsHurdle,
      riskState: evaluation.state,
      veto: evaluation.veto,
      executed: apply.applied,
      proposalId: proposal.id,
      intents: evaluation.intents.map((x) => ({
        id: x.intentId,
        kind: x.kind,
        decision: x.decision,
        reasons: x.reasons,
      })),
      nav: ledger.nav(),
      debt: ledger.totalDebt(),
      income: ledger.incomeTotal(),
      costs: ledger.expenseTotal(),
      drawdown: after.maxDrawdown,
      reasons: [
        ...comparison.recommendation.reasons,
        ...apply.memos,
        ...(evaluation.veto ? ['Risk governor veto: hypothetical execution skipped.'] : []),
      ],
    };
    steps.push(record);
    prevNav = ledger.nav();
  }

  const last = steps[steps.length - 1];
  const veto = steps.some((s) => s.veto);
  const posture = hasDeployedPositions(ledger) ? 'deployed' : 'hold_liquid';
  const endedAt = last?.at ?? startedAt;
  const headline = headlineOf({
    seedUsd,
    steps: config.steps,
    posture,
    strategyId: last?.strategyId ?? 'preserve-liquid',
    nav: ledger.nav(),
    debt: ledger.totalDebt(),
    veto,
  });
  persistPaperRun({
    stateDir,
    config,
    ledger,
    startedAt,
    endedAt,
    clockNow: endedAt,
    posture,
    headline,
    veto,
    noDeployment: last?.noDeployment ?? true,
    riskMemory: memory,
    steps,
  });

  return {
    config,
    startedAt,
    endedAt,
    steps,
    posture,
    headline,
    veto,
    noDeployment: last?.noDeployment ?? true,
    recommendedAction: last?.recommendedAction ?? 'hold_liquid',
    nav: ledger.nav(),
    debt: ledger.totalDebt(),
    income: ledger.incomeTotal(),
    costs: ledger.expenseTotal(),
    drawdown: last?.drawdown ?? d(0),
    ledger,
    lastComparison,
    lastEvaluation,
    riskMemory: memory,
    stateDir,
  };
}

export function defaultPaperSnapshotPath(): string {
  return defaultSnapshotPath();
}
