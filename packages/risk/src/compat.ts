import {
  balanceSheetReport,
  d,
  deployableCapital,
  requiredLiquidityReserve,
  type BalanceSheet,
  type Decimal,
  type DisclosureProfile,
} from '@shadow-banking/core';
import { DEFAULT_HURDLE, SMALL_POSITION_USD, defaultConfig } from './config.js';
import { evaluateProposal } from './evaluate.js';
import { tick, type TickOptions } from './machine.js';
import { observationFromBook, observationFromFlat, type FlatSnapshot } from './observe.js';
import type { EvaluationResult, Proposal, RiskEvaluation } from './types.js';

export type { FlatSnapshot };

export interface GovernorSnapshot {
  asOf: string;
  navUsd: Decimal;
  equityUsd: Decimal;
  debtUsd: Decimal;
  grossAssetsUsd: Decimal;
  reserveHeldUsd: Decimal;
  reserveRequiredUsd: Decimal;
  healthFactor: Decimal | null;
  correlated: boolean;
  smallPosition: boolean;
  drawdown: Decimal;
  dailyPnl: Decimal;
  hurdle: Decimal;
  netCarry: Decimal | null;
}

export function snapshotFromBook(
  book: BalanceSheet,
  disclosure: DisclosureProfile,
  extras: {
    drawdown?: Decimal;
    dailyPnl?: Decimal;
    hurdle?: Decimal;
    netCarry?: Decimal | null;
  } = {},
): GovernorSnapshot {
  const report = balanceSheetReport(book);
  const dep = deployableCapital(disclosure, report.reserveHeld);
  const req = requiredLiquidityReserve(disclosure, dep.deployable);
  const correlated = report.positions.some((p) => p.eMode);
  const debt = report.totalLiabilities;
  const collateral = report.positions.reduce((s, p) => s.plus(p.collateralValue), d(0));
  const smallPosition =
    debt.gt(0) && (collateral.lt(SMALL_POSITION_USD) || debt.lt(SMALL_POSITION_USD));
  return {
    asOf: book.asOf,
    navUsd: report.equity,
    equityUsd: report.equity,
    debtUsd: debt,
    grossAssetsUsd: report.totalAssets,
    reserveHeldUsd: report.reserveHeld,
    reserveRequiredUsd: req.total,
    healthFactor: report.worstHealthFactor,
    correlated,
    smallPosition,
    drawdown: extras.drawdown ?? d(0),
    dailyPnl: extras.dailyPnl ?? d(0),
    hurdle: extras.hurdle ?? DEFAULT_HURDLE,
    netCarry: extras.netCarry ?? null,
  };
}

export function evaluateGovernorSnapshot(
  snap: GovernorSnapshot,
  opts: TickOptions & { noDeployment?: boolean; proposal?: Proposal | null } = {},
): RiskEvaluation {
  const obs = observationFromFlat(snap);
  const hurdle = opts.config?.hurdleApy ?? snap.hurdle;
  obs.hurdle = hurdle;
  const config = defaultConfig({ ...(opts.config ?? {}), hurdleApy: hurdle });
  const tickOpts: TickOptions = { config };
  if (opts.memory) tickOpts.memory = opts.memory;
  if (opts.now !== undefined) tickOpts.now = opts.now;
  if (opts.humanAck !== undefined) tickOpts.humanAck = opts.humanAck;
  if (opts.unwindComplete !== undefined) tickOpts.unwindComplete = opts.unwindComplete;
  if (opts.noDeployment !== undefined) tickOpts.noDeployment = opts.noDeployment;
  const ticked = tick(obs, tickOpts);
  return toView(ticked);
}

export function evaluateBook(
  book: BalanceSheet,
  disclosure: DisclosureProfile,
  opts: TickOptions & { proposal?: Proposal | null } = {},
): EvaluationResult {
  const extras = opts.config?.hurdleApy !== undefined ? { hurdle: opts.config.hurdleApy } : {};
  const obs = observationFromBook(book, disclosure, extras);
  return evaluateProposal(obs, opts.proposal ?? null, opts);
}

function toView(t: ReturnType<typeof tick>): RiskEvaluation {
  const rc = t.metrics.reserveRequiredUsd.gt(0)
    ? t.metrics.reserveHeldUsd.div(t.metrics.reserveRequiredUsd)
    : null;
  return {
    asOf: t.asOf,
    state: t.state,
    veto: t.veto,
    recommendedAction: t.recommendedAction,
    noDeployment: t.noDeployment,
    hurdle: t.hurdle,
    metrics: {
      navUsd: t.metrics.navUsd,
      equityUsd: t.metrics.equityUsd,
      debtUsd: t.metrics.debtUsd,
      grossAssetsUsd: t.metrics.grossAssetsUsd,
      leverage: t.metrics.leverage,
      reserveHeldUsd: t.metrics.reserveHeldUsd,
      reserveRequiredUsd: t.metrics.reserveRequiredUsd,
      reserveCoverage: rc,
      healthFactor: t.metrics.healthFactor,
      correlated: t.metrics.correlated,
      smallPosition: t.metrics.smallPosition,
      drawdown: t.metrics.drawdown,
      dailyPnl: t.metrics.dailyPnl,
    },
    triggers: t.triggers,
    limits: {
      maxLeverage: t.limits.maxLeverage,
      hfCaution: t.limits.hfCaution,
      hfDeleveraging: t.limits.hfDeleveraging,
      hfEmergency: t.limits.hfEmergency,
    },
    notes: t.notes,
  };
}
