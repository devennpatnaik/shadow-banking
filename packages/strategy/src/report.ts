import { formatMoney, formatPct, formatRatio } from '@shadow-banking/core';
import type { ComparisonResult, StrategyEvaluation } from './types.js';

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : `${s}${' '.repeat(n - s.length)}`;
}

function row(cells: string[], widths: number[]): string {
  return cells.map((c, i) => pad(c, widths[i] ?? c.length)).join('  ');
}

function hf(e: StrategyEvaluation): string {
  return e.risk.healthFactor ? e.risk.healthFactor.toFixed(2) : 'n/a';
}

function ld(e: StrategyEvaluation): string {
  const lending = e.risk.liquidationDistance;
  const hedge = e.risk.hedgeLiquidationDistance;
  if (lending !== null) return formatPct(lending);
  if (hedge !== null) return formatPct(hedge);
  return 'n/a';
}

export function formatComparison(result: ComparisonResult): string {
  const widths = [16, 8, 10, 10, 10, 8, 8, 8, 10, 8, 8];
  const header = row(
    [
      'strategy',
      'gross',
      'est.net',
      'realized',
      '$/yr',
      'HF',
      'LD',
      'lev',
      'risk-adj',
      'hurdle',
      'ok?',
    ],
    widths,
  );
  const lines = [
    `Strategy comparison  ·  snapshot ${result.snapshotDate}  ·  seed ${formatMoney(result.capital.seedUsd)}  ·  deployable ${formatMoney(result.capital.deployableUsd)}  ·  reserve ${formatPct(result.capital.reserveRate)}  ·  hurdle ${formatPct(result.hurdleApy)}  ·  ALL FIGURES ARE ESTIMATES`,
    `Horizon ${result.horizonDays}d. Expected net = recurring income − financing − execution − expected losses. Realized yield is not available without the accounting ledger.`,
    '',
    header,
    '-'.repeat(header.length),
  ];
  for (const e of result.evaluations) {
    const ok = !e.eligible ? 'skip' : e.portfolioClearsHurdle ? 'YES' : 'no';
    lines.push(
      row(
        [
          e.id,
          formatPct(e.yield.grossApy),
          formatPct(e.portfolioEstimatedNetApy),
          e.yield.realized.capable ? formatPct(e.yield.realized.apy) : 'n/a',
          formatMoney(e.portfolioEstimatedNetUsd),
          hf(e),
          ld(e),
          formatRatio(e.risk.leverage),
          formatPct(e.riskAdjustedApy),
          formatPct(result.hurdleApy),
          ok,
        ],
        widths,
      ),
    );
  }
  lines.push('');
  for (const e of result.evaluations) {
    if (!e.eligible) {
      lines.push(`  ${e.id}: ineligible — ${e.ineligibleReason}`);
      continue;
    }
    lines.push(
      `  ${e.id}: ${e.label}`,
      `    income ${formatMoney(e.yield.grossIncomeUsd)} − fin ${formatMoney(e.yield.financingUsd)} − exec ${formatMoney(e.yield.executionUsd)} − E[loss] ${formatMoney(e.yield.expectedLossUsd)} = est.net ${formatMoney(e.yield.estimatedNetUsd)} on sleeve (${formatPct(e.yield.estimatedNetApy)})`,
      `    risk: HF ${hf(e)}  LD ${ld(e)}  lev ${formatRatio(e.risk.leverage)}  directional ${formatPct(e.risk.directionalExposure)}  conc ${e.risk.concentration.byProtocol}/${e.risk.concentration.byNetwork}  small-pos ${e.risk.smallPosition}  within-limits ${e.risk.withinGovernorLimits}`,
    );
    if (e.risk.breaches.length) {
      for (const b of e.risk.breaches) lines.push(`    · breach: ${b}`);
    }
  }
  const rec = result.recommendation;
  lines.push('', `recommend: ${rec.action}  (${rec.strategyId})  clearsHurdle=${rec.clearsHurdle}`);
  for (const r of rec.reasons) lines.push(`  · ${r}`);
  lines.push(
    `  · capital: liquid reserve ${formatMoney(result.capital.reserveUsd)} / investable ${formatMoney(result.capital.investableUsd)} / household requirement ${formatMoney(result.capital.householdRequirementUsd)}`,
  );
  for (const w of result.warnings) lines.push(`  · ${w}`);
  return lines.join('\n');
}
