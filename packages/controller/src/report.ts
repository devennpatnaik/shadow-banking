import { formatPerformance } from '@shadow-banking/accounting';
import { buildPerformanceReport } from '@shadow-banking/accounting';
import { formatMoney, formatPct } from '@shadow-banking/core';
import type { PaperRunResult } from './types.js';

function pad(s: string, n: number): string {
  return s.length >= n ? s : `${s}${' '.repeat(n - s.length)}`;
}

export function formatPaperRun(result: PaperRunResult): string {
  const perf = buildPerformanceReport(result.ledger, result.config.hurdleApy);
  const lines: string[] = [
    'Paper portfolio controller (Phase 4)',
    '------------------------------------',
    result.headline,
    `Execution forbidden. Signing keys: none. Live transactions: none.`,
    `Hurdle ${formatPct(result.config.hurdleApy)} annualized net (configurable; not a promise). Survival over yield.`,
    `Snapshot ${result.config.snapshotPath}  ·  provider ${result.config.provider}`,
    `State dir ${result.stateDir}`,
    '',
    `${pad('Posture', 22)}  ${result.posture === 'hold_liquid' ? 'HOLD LIQUID (reserve-only stack)' : 'STACK (paper only)'}`,
    `${pad('Action', 22)}  ${result.recommendedAction}`,
    `${pad('Veto', 22)}  ${result.veto ? 'YES (exit 2) — vetoed actions were not executed' : 'no'}`,
    `${pad('NAV', 22)}  ${formatMoney(result.nav)}`,
    `${pad('Debt', 22)}  ${formatMoney(result.debt)}`,
    `${pad('Income', 22)}  ${formatMoney(result.income)}`,
    `${pad('Costs', 22)}  ${formatMoney(result.costs)}`,
    `${pad('Max drawdown', 22)}  ${formatPct(result.drawdown)}`,
    '',
    'Clock',
  ];
  const widths = [6, 12, 14, 10, 10, 10, 8, 6];
  const header = ['step', 'asOf', 'posture', 'NAV', 'debt', 'income', 'veto', 'exec'];
  lines.push(header.map((c, i) => pad(c, widths[i] ?? 8)).join('  '));
  for (const s of result.steps) {
    const row = [
      String(s.step),
      s.at.slice(0, 10),
      s.posture,
      formatMoney(s.nav),
      formatMoney(s.debt),
      formatMoney(s.income),
      s.veto ? 'YES' : 'no',
      s.executed ? 'yes' : 'hold',
    ];
    lines.push(row.map((c, i) => pad(c, widths[i] ?? 8)).join('  '));
  }
  lines.push('');
  lines.push(formatPerformance(perf));
  if (result.lastStack) {
    lines.push('');
    lines.push(
      `Stack: ${result.lastStack.legs.map((l) => l.kind).join(' → ')}  net ${result.lastStack.consolidatedNetApy.toFixed(4)}  ${result.lastStack.stopReason}`,
    );
  }
  lines.push('');
  lines.push('Do not broadcast transactions. Phase 5 propose+approve only.');
  return lines.join('\n');
}
