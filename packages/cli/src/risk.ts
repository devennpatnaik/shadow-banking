import {
  balanceSheetReport,
  d,
  deployableCapital,
  requiredLiquidityReserve,
  type BalanceSheet,
  type Decimal,
  type DisclosureProfile,
} from '@shadow-banking/core';
import { DEFAULT_HURDLE } from './defaults.js';
import type { GovernorSnapshot } from './hydrate.js';

export type RiskState = 'Normal' | 'Caution' | 'Deleveraging' | 'Emergency';

export type RecommendedAction =
  'hold_liquid' | 'operate_paper' | 'add_reserves' | 'deleverage' | 'unwind';

export interface RiskTrigger {
  metric: string;
  detail: string;
  state: RiskState;
}

export interface RiskEvaluation {
  asOf: string;
  state: RiskState;
  veto: boolean;
  recommendedAction: RecommendedAction;
  noDeployment: boolean;
  hurdle: Decimal;
  metrics: {
    navUsd: Decimal;
    equityUsd: Decimal;
    debtUsd: Decimal;
    grossAssetsUsd: Decimal;
    leverage: Decimal | null;
    reserveHeldUsd: Decimal;
    reserveRequiredUsd: Decimal;
    reserveCoverage: Decimal | null;
    healthFactor: Decimal | null;
    correlated: boolean;
    smallPosition: boolean;
    drawdown: Decimal;
    dailyPnl: Decimal;
  };
  triggers: RiskTrigger[];
  limits: {
    maxLeverage: Decimal;
    hfCaution: Decimal;
    hfDeleveraging: Decimal;
    hfEmergency: Decimal;
  };
  notes: string[];
}

const ORDER: readonly RiskState[] = ['Normal', 'Caution', 'Deleveraging', 'Emergency'];

function worse(a: RiskState, b: RiskState): RiskState {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

function hfBands(
  correlated: boolean,
  smallPosition: boolean,
): {
  caution: Decimal;
  delev: Decimal;
  emerg: Decimal;
} {
  const extra = smallPosition ? d('0.10') : d(0);
  if (correlated) {
    return {
      caution: d('1.25').plus(extra),
      delev: d('1.12').plus(extra),
      emerg: d('1.05').plus(extra),
    };
  }
  return {
    caution: d('1.60').plus(extra),
    delev: d('1.35').plus(extra),
    emerg: d('1.15').plus(extra),
  };
}

function actionFor(state: RiskState, noDeployment: boolean): RecommendedAction {
  if (state === 'Emergency') return 'unwind';
  if (state === 'Deleveraging') return 'deleverage';
  if (state === 'Caution') return 'add_reserves';
  return noDeployment ? 'hold_liquid' : 'operate_paper';
}

export function evaluateGovernorSnapshot(
  snap: GovernorSnapshot,
  opts: { noDeployment?: boolean } = {},
): RiskEvaluation {
  const triggers: RiskTrigger[] = [];
  const notes: string[] = [
    'Rules from docs/risk-governor.md §3–§4 (starting simulation values). Not live monitoring.',
    'Survival over yield. A veto cannot be overridden by this CLI or by an AI layer.',
  ];

  const maxLeverage = snap.correlated ? d('3.0') : d('2.0');
  const bands = hfBands(snap.correlated, snap.smallPosition);
  const leverage =
    snap.equityUsd.gt(0) && snap.grossAssetsUsd.gt(0)
      ? snap.grossAssetsUsd.div(snap.equityUsd)
      : snap.debtUsd.gt(0)
        ? null
        : d(1);
  const rc = snap.reserveRequiredUsd.gt(0)
    ? snap.reserveHeldUsd.div(snap.reserveRequiredUsd)
    : null;

  const raise = (next: RiskState, metric: string, detail: string): void => {
    triggers.push({ metric, detail, state: next });
  };

  if (snap.healthFactor !== null) {
    if (snap.healthFactor.lt(bands.emerg)) {
      raise(
        'Emergency',
        'healthFactor',
        `HF ${snap.healthFactor.toFixed(4)} < Emergency ${bands.emerg.toFixed(2)} (${snap.correlated ? 'correlated' : 'uncorrelated'}${snap.smallPosition ? ', small-position +0.10' : ''})`,
      );
    } else if (snap.healthFactor.lt(bands.delev)) {
      raise(
        'Deleveraging',
        'healthFactor',
        `HF ${snap.healthFactor.toFixed(4)} < Deleveraging ${bands.delev.toFixed(2)}`,
      );
    } else if (snap.healthFactor.lt(bands.caution)) {
      raise(
        'Caution',
        'healthFactor',
        `HF ${snap.healthFactor.toFixed(4)} < Caution ${bands.caution.toFixed(2)}`,
      );
    }
  }

  if (leverage !== null && leverage.gt(maxLeverage)) {
    raise(
      'Deleveraging',
      'leverage',
      `gross leverage ${leverage.toFixed(4)}x exceeds cap ${maxLeverage.toFixed(1)}x`,
    );
  }

  if (rc !== null) {
    if (rc.lt('0.5')) raise('Emergency', 'reserveCoverage', `RC ${rc.toFixed(4)} < 0.5`);
    else if (rc.lt('0.75')) raise('Deleveraging', 'reserveCoverage', `RC ${rc.toFixed(4)} < 0.75`);
    else if (rc.lt(1)) raise('Caution', 'reserveCoverage', `RC ${rc.toFixed(4)} < 1.0`);
  }

  if (snap.dailyPnl.lte('-0.06'))
    raise('Emergency', 'dailyPnl', `daily P&L ${snap.dailyPnl.toFixed(4)} ≤ -6% NAV (hard limit)`);
  else if (snap.dailyPnl.lte('-0.04'))
    raise('Deleveraging', 'dailyPnl', `daily P&L ${snap.dailyPnl.toFixed(4)} ≤ -4% NAV`);
  else if (snap.dailyPnl.lte('-0.02'))
    raise('Caution', 'dailyPnl', `daily P&L ${snap.dailyPnl.toFixed(4)} ≤ -2% NAV`);

  if (snap.drawdown.lte('-0.15'))
    raise(
      'Emergency',
      'drawdown',
      `drawdown ${snap.drawdown.toFixed(4)} ≤ -15% HWM (latched hard limit)`,
    );
  else if (snap.drawdown.lte('-0.10'))
    raise('Deleveraging', 'drawdown', `drawdown ${snap.drawdown.toFixed(4)} ≤ -10% HWM`);
  else if (snap.drawdown.lte('-0.05'))
    raise('Caution', 'drawdown', `drawdown ${snap.drawdown.toFixed(4)} ≤ -5% HWM`);

  if (snap.netCarry !== null && snap.netCarry.lte(0)) {
    raise(
      'Caution',
      'netCarry',
      `net carry ${snap.netCarry.toFixed(4)} ≤ 0 (hold or deleverage; do not add risk)`,
    );
  }

  const state = triggers.reduce<RiskState>((s, t) => worse(s, t.state), 'Normal');
  const noDeployment = opts.noDeployment === true || state !== 'Normal';
  if (noDeployment) {
    notes.push(
      'noDeployment: preserve capital in liquid form. Do not open new strategies or increase leverage.',
    );
  }

  const veto = state === 'Deleveraging' || state === 'Emergency';
  if (veto) {
    notes.push(
      'RISK VETO: the governor rejects risk-increasing actions. The AI must not work around this.',
    );
  }

  const recommendedAction = actionFor(state, noDeployment);
  return {
    asOf: snap.asOf,
    state,
    veto,
    recommendedAction,
    noDeployment,
    hurdle: snap.hurdle,
    metrics: {
      navUsd: snap.navUsd,
      equityUsd: snap.equityUsd,
      debtUsd: snap.debtUsd,
      grossAssetsUsd: snap.grossAssetsUsd,
      leverage,
      reserveHeldUsd: snap.reserveHeldUsd,
      reserveRequiredUsd: snap.reserveRequiredUsd,
      reserveCoverage: rc,
      healthFactor: snap.healthFactor,
      correlated: snap.correlated,
      smallPosition: snap.smallPosition,
      drawdown: snap.drawdown,
      dailyPnl: snap.dailyPnl,
    },
    triggers,
    limits: {
      maxLeverage,
      hfCaution: bands.caution,
      hfDeleveraging: bands.delev,
      hfEmergency: bands.emerg,
    },
    notes,
  };
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
  return snapshotFromReport(book, report, req.total, extras);
}

function snapshotFromReport(
  book: BalanceSheet,
  report: ReturnType<typeof balanceSheetReport>,
  reserveRequiredUsd: Decimal,
  extras: {
    drawdown?: Decimal;
    dailyPnl?: Decimal;
    hurdle?: Decimal;
    netCarry?: Decimal | null;
  },
): GovernorSnapshot {
  const correlated = report.positions.some((p) => p.eMode);
  const debt = report.totalLiabilities;
  const collateral = report.positions.reduce((s, p) => s.plus(p.collateralValue), d(0));
  const smallPosition = debt.gt(0) && (collateral.lt(2000) || debt.lt(2000));
  return {
    asOf: book.asOf,
    navUsd: report.equity,
    equityUsd: report.equity,
    debtUsd: debt,
    grossAssetsUsd: report.totalAssets,
    reserveHeldUsd: report.reserveHeld,
    reserveRequiredUsd: reserveRequiredUsd,
    healthFactor: report.worstHealthFactor,
    correlated,
    smallPosition,
    drawdown: extras.drawdown ?? d(0),
    dailyPnl: extras.dailyPnl ?? d(0),
    hurdle: extras.hurdle ?? DEFAULT_HURDLE,
    netCarry: extras.netCarry ?? null,
  };
}

export function actionCopy(action: RecommendedAction): string {
  switch (action) {
    case 'hold_liquid':
      return 'Hold liquid. No strategy clears the hurdle (or none is available). Do not deploy.';
    case 'operate_paper':
      return 'Paper only: a strategy may be modelled. Do not execute real transactions in Phases 1–4.';
    case 'add_reserves':
      return 'Caution: stop increasing leverage; add reserves or reduce risk.';
    case 'deleverage':
      return 'Deleveraging: repay debt / reduce exposure. Risk veto on new risk.';
    case 'unwind':
      return 'Emergency: safest feasible unwind to liquid form. Risk veto. Human acknowledgement required to reset.';
  }
}
