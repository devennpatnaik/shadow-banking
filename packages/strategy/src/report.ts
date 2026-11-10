import { formatMoney, formatPct, formatRatio } from '@shadow-banking/core';
import type { ComparisonResult, StrategyEvaluation } from './types.js';
import type { CapitalStack } from './stack-types.js';

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
    `Strategy comparison (diagnostic; product is the multi-use stack)  ·  snapshot ${result.snapshotDate}  ·  seed ${formatMoney(result.capital.seedUsd)}  ·  deployable ${formatMoney(result.capital.deployableUsd)}  ·  reserve ${formatPct(result.capital.reserveRate)}  ·  hurdle ${formatPct(result.hurdleApy)}  ·  ALL FIGURES ARE ESTIMATES`,
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

export function formatStack(stack: CapitalStack): string {
  const widths = [4, 20, 10, 10, 10, 10, 8, 8];
  const header = row(['#', 'leg', 'income', 'fin+exec', 'net', 'marginal', 'HF', 'lev'], widths);
  const lines = [
    `Capital stack  ·  snapshot ${stack.snapshotDate}  ·  seed ${formatMoney(stack.seedUsd)}  ·  owner equity ${formatMoney(stack.ownerEquityUsd)}  ·  borrowed ${formatMoney(stack.borrowedCapitalUsd)}  ·  hurdle ${formatPct(stack.hurdleApy)}  ·  ESTIMATES`,
    `Concurrent uses of the same equity. Hold liquid = reserve-only stack. NAV ${formatMoney(stack.navUsd)}  debt ${formatMoney(stack.debtUsd)}  HF ${stack.healthFactor ? stack.healthFactor.toFixed(2) : 'n/a'}.`,
    '',
    header,
    '-'.repeat(header.length),
  ];
  for (const leg of stack.legs) {
    lines.push(
      row(
        [
          String(leg.order),
          leg.kind,
          formatMoney(leg.incomeUsd),
          formatMoney(leg.financingUsd.plus(leg.executionUsd)),
          formatMoney(leg.estimatedNetUsd),
          formatPct(leg.marginalNetApy),
          leg.healthFactor ? leg.healthFactor.toFixed(2) : 'n/a',
          formatRatio(leg.leverage),
        ],
        widths,
      ),
    );
  }
  lines.push(
    '',
    `consolidated net ${formatMoney(stack.consolidated.estimatedNetUsd)}/yr  (${formatPct(stack.consolidatedNetApy)})  clearsHurdle=${stack.clearsHurdle}`,
    `  income ${formatMoney(stack.consolidated.grossIncomeUsd)} − fin ${formatMoney(stack.consolidated.financingUsd)} − exec ${formatMoney(stack.consolidated.executionUsd)} − E[loss] ${formatMoney(stack.consolidated.expectedLossUsd)}`,
    `action: ${stack.recommendedAction}  noDeployment=${stack.noDeployment}`,
    `stop: ${stack.stopReason}`,
  );
  if (stack.nextProposedLeg) {
    lines.push(`next leg: ${stack.nextProposedLeg.kind} — ${stack.nextProposedLeg.reason}`);
  }
  for (const w of stack.warnings) lines.push(`  · ${w}`);
  return lines.join('\n');
}
