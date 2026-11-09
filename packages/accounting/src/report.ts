import { ZERO, formatMoney, formatPct, formatRatio } from '@shadow-banking/core';
import type { AllocatorResult } from './allocate.js';
import type { Ledger } from './ledger.js';
import type { PerformanceReport } from './performance.js';
import { CHART, ACCOUNT_IDS } from './chart.js';

function pad(s: string, n: number): string {
  return s.length >= n ? s : `${s}${' '.repeat(n - s.length)}`;
}

function kv(label: string, value: string, width = 32): string {
  return `${pad(label, width)}  ${value}`;
}

export function formatPerformance(report: PerformanceReport): string {
  const lines = [
    report.label,
    `${report.currency}  ·  ${report.periodStart.slice(0, 10)} → ${report.periodEnd.slice(0, 10)}  (${report.periodDays.toFixed(0)}d)`,
    'REALIZED vs ESTIMATE: annualized yield is an ESTIMATE. Protocol APYs are not the product output.',
    `Evaluation hurdle ${formatPct(report.hurdleApy)} (configurable; not a promised return).`,
    '',
    'Balance sheet',
    kv('NAV (assets − liabilities)', formatMoney(report.nav)),
    kv('Gross assets', formatMoney(report.grossAssets)),
    kv('Total debt', formatMoney(report.totalDebt)),
    kv('Gross assets / equity', formatRatio(report.grossAssetsToEquity)),
    kv('Liquid reserves', formatMoney(report.liquidReserves)),
    kv('Deployed capital', formatMoney(report.deployedCapital)),
    '',
    'Capital flows (not P&L)',
    kv('Initial equity', formatMoney(report.initialEquity)),
    kv('Subsequent deposits', formatMoney(report.deposits)),
    kv('Withdrawals', formatMoney(report.withdrawals)),
    kv('Net contributed', formatMoney(report.netContributedCapital)),
    '',
    'Consolidated performance',
    kv('Net P&L', formatMoney(report.netPnl)),
    kv('  of which realized', formatMoney(report.realizedPnl)),
    kv('  of which unrealized', formatMoney(report.unrealizedPnl)),
    kv('Period return (unit NAV)', formatPct(report.periodReturn)),
    kv('Net annualized yield (ESTIMATE)', formatPct(report.netAnnualizedYield)),
    kv('Realized return on initial equity', formatPct(report.realizedReturn)),
    kv('ROIE', formatPct(report.roie)),
    kv('ROAE (period / avg equity)', formatPct(report.roae)),
    kv('Return on deployed capital', formatPct(report.returnOnDeployedCapital)),
    kv('Financing costs', formatMoney(report.financingCosts)),
    kv('Max drawdown (unit NAV)', formatPct(report.maxDrawdown)),
    kv(
      'Clears hurdle (annualized est.)',
      report.clearsHurdleOnAnnualizedEstimate === null
        ? 'n/a'
        : report.clearsHurdleOnAnnualizedEstimate
          ? 'yes'
          : 'no',
    ),
    '',
    'Income (realized credits)',
    kv('  Staking', formatMoney(report.income.staking)),
    kv('  Lending', formatMoney(report.income.lending)),
    kv('  Funding received', formatMoney(report.income.funding)),
    kv('  LP', formatMoney(report.income.lp)),
    kv('  Incentives', formatMoney(report.income.incentives)),
    kv('  Realized P&L', formatMoney(report.income.realizedPnl)),
    '',
    'Expenses',
    kv('  Fees', formatMoney(report.expenses.fees)),
    kv('  Financing cost', formatMoney(report.expenses.financingCost)),
    kv('  Funding paid', formatMoney(report.expenses.fundingExpense)),
    kv('  Liquidation losses', formatMoney(report.expenses.liquidationLoss)),
    kv('  Other losses', formatMoney(report.expenses.otherLoss)),
    kv('  Operating expenses', formatMoney(report.expenses.operatingExpense)),
    '',
    'Liquidation exposure',
    kv('  Collateral', formatMoney(report.liquidationExposure.totalCollateral)),
    kv('  Debt', formatMoney(report.liquidationExposure.totalDebt)),
    kv(
      '  Worst health factor',
      report.liquidationExposure.worstHealthFactor
        ? report.liquidationExposure.worstHealthFactor.toFixed(3)
        : 'n/a',
    ),
    kv('  Worst drop-to-liq', formatPct(report.liquidationExposure.worstLiquidationDistance)),
    '',
    report.annualizationAssumptions,
    report.figuresNote,
  ];
  return lines.join('\n');
}

export function formatLedger(ledger: Ledger): string {
  const widths = [8, 20, 12, 16, 10, 14];
  const header = ['id', 'at', 'category', 'kind', 'debits', 'memo']
    .map((c, i) => pad(c, widths[i]!))
    .join('  ');
  const lines = [
    ledger.meta.label,
    `NAV ${formatMoney(ledger.nav())}  ·  ${ledger.getEntries().length} entries  ·  borrowed principal is not income`,
    '',
    header,
    '-'.repeat(header.length),
  ];
  for (const e of ledger.getEntries()) {
    const debits = e.lines
      .filter((l) => l.side === 'debit')
      .reduce((s, l) => s.plus(l.amount), ZERO);
    lines.push(
      [
        pad(e.id, 8),
        pad(e.at.replace('T', ' ').replace('Z', ''), 20),
        pad(e.category, 12),
        pad(e.kind, 16),
        pad(formatMoney(debits), 10),
        e.memo,
      ].join('  '),
    );
  }
  lines.push('', 'Trial balance');
  for (const id of ACCOUNT_IDS) {
    const b = ledger.balance(id);
    if (b.eq(0)) continue;
    lines.push(kv(CHART[id].name, formatMoney(b), 42));
  }
  return lines.join('\n');
}

export function formatAllocator(result: AllocatorResult): string {
  const lines = [
    `Retained-earnings allocation  ·  ${result.riskState}  ·  RECOMMENDATION ONLY (executes=${result.executes})`,
    `Net earnings ${formatMoney(result.netEarnings)}  ·  allocated ${formatMoney(result.totalAllocated)}  ·  holdLiquid=${result.holdLiquid}`,
    '',
  ];
  if (result.uses.length === 0) lines.push('(no slices)');
  for (const u of result.uses) {
    lines.push(`${pad(u.use, 18)}  ${formatMoney(u.amount)}  (${formatPct(u.share)})`);
    lines.push(`  ${u.reason}`);
  }
  lines.push('');
  for (const n of result.notes) lines.push(`· ${n}`);
  return lines.join('\n');
}
