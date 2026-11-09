import { formatMoney, formatPct, formatRatio } from '@shadow-banking/core';
import { actionCopy } from './action.js';
import type { EvaluationResult, TickResult } from './types.js';

function pad(s: string, n: number): string {
  return s.length >= n ? s : `${s}${' '.repeat(n - s.length)}`;
}

function kvTable(rows: readonly [string, string][]): string {
  const width = rows.reduce((w, [k]) => Math.max(w, k.length), 0);
  return rows.map(([k, v]) => `${pad(k, width)}  ${v}`).join('\n');
}

function banner(title: string, extra?: string): string {
  const line = extra ? `${title}  ·  ${extra}` : title;
  return `${line}\n${'-'.repeat(Math.min(line.length, 80))}`;
}

export function formatTick(t: TickResult, heading = 'Risk governor'): string {
  const m = t.metrics;
  const rc = m.reserveRequiredUsd.gt(0) ? m.reserveHeldUsd.div(m.reserveRequiredUsd) : null;
  const lines = [
    banner(`${heading}  ·  ${t.state}${t.veto ? '  ·  VETO' : ''}`, t.transition),
    kvTable([
      ['State', t.state],
      ['Previous', t.previousState],
      ['Veto', t.veto ? 'YES (exit 2)' : 'no'],
      ['NAV', formatMoney(m.navUsd)],
      ['Equity', formatMoney(m.equityUsd)],
      ['Debt', formatMoney(m.debtUsd)],
      ['Leverage', formatRatio(m.leverage)],
      ['LTV', m.ltv ? formatPct(m.ltv) : 'n/a'],
      ['HF', m.healthFactor ? m.healthFactor.toFixed(4) : 'n/a'],
      ['LD_lend', formatPct(m.liquidationDistance)],
      ['Small position', m.smallPosition ? 'yes (Aave v3.3 100% close factor < $2k)' : 'no'],
      ['Class', m.correlated ? 'correlated (E-mode)' : 'uncorrelated'],
      ['Reserves', `${formatMoney(m.reserveHeldUsd)} / req ${formatMoney(m.reserveRequiredUsd)}`],
      ['RC', rc ? rc.toFixed(4) : 'n/a'],
      ['Drawdown', formatPct(m.drawdown)],
      ['Daily P&L', formatPct(m.dailyPnl)],
      ['Hurdle', formatPct(t.hurdle)],
      ['Action', t.recommendedAction],
      ['noDeployment', String(t.noDeployment)],
    ]),
    '',
    actionCopy(t.recommendedAction),
    ...t.triggers.map((tr) => `  - [${tr.state}] ${tr.metric}: ${tr.detail}`),
  ];
  if (t.mandated.length > 0) {
    lines.push('', 'Mandated (paper, not executed):');
    for (const mnd of t.mandated) lines.push(`  - ${mnd.kind}: ${mnd.reason}`);
  }
  lines.push(
    '',
    'Never execute real transactions in Phases 1–4. No signing keys in this interface.',
  );
  return lines.join('\n');
}

export function formatEvaluation(e: EvaluationResult): string {
  const base = formatTick(e, 'Risk evaluate');
  if (e.intents.length === 0) return base;
  const rows = e.intents.map((i) => {
    const why = i.reasons.length > 0 ? i.reasons.join('; ') : 'ok';
    return `  - ${i.intentId} (${i.kind}): ${i.decision} — ${why}`;
  });
  return `${base}\n\nProposal ${e.proposalId ?? '—'}  ·  ${e.decision}\n${rows.join('\n')}`;
}
