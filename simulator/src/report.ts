import { formatMoney, formatPct, formatRatio } from '@shadow-banking/core';
import type { SimulationResult } from './types.js';
import type { StressResult } from './stress.js';

function pad(s: string, n: number): string {
  return s.length >= n ? s : `${s}${' '.repeat(n - s.length)}`;
}

function row(cells: string[], widths: number[]): string {
  return cells.map((c, i) => pad(c, widths[i] ?? c.length)).join('  ');
}

export function formatTable(result: SimulationResult): string {
  const widths = [4, 12, 10, 10, 8, 8, 8, 10, 10, 8, 8];
  const header = row(
    [
      '#',
      'collateral',
      'debt',
      'equity',
      'lev',
      'LTV',
      'HF',
      'drop-to-liq',
      'est.net ROE',
      'on seed',
      'ok?',
    ],
    widths,
  );
  const lines = [
    result.input.label,
    `snapshot ${result.input.snapshotDate}  ·  seed ${formatMoney(result.input.seedUsd)}  ·  reserve ${formatPct(result.input.reserveRate)}  ·  horizon ${result.input.horizonDays}d  ·  ALL FIGURES ARE ESTIMATES`,
    `gas basis: ${result.input.costs.gasBasisLabel}`,
    '',
    header,
    '-'.repeat(header.length),
  ];
  for (const s of result.steps) {
    lines.push(
      row(
        [
          String(s.index),
          formatMoney(s.collateralUsd),
          formatMoney(s.debtUsd),
          formatMoney(s.equityUsd),
          formatRatio(s.leverage),
          formatPct(s.ltv),
          s.risk.healthFactor ? s.risk.healthFactor.toFixed(3) : 'n/a',
          formatPct(s.risk.priceDropToLiquidation),
          formatPct(s.netRoe),
          formatPct(s.netYieldOnSeed),
          s.withinLimits ? 'yes' : 'NO',
        ],
        widths,
      ),
    );
  }
  const rec = result.recommendation;
  lines.push(
    '',
    `stop: ${result.stopReason} — ${result.stopDetail}`,
    `recommend: ${rec.action} (loops=${rec.loops})  estimated net yield on seed ${formatPct(rec.netYieldOnSeed)}  hurdle ${formatPct(rec.hurdleApy)}  clears=${rec.clearsHurdle}`,
  );
  for (const r of rec.reasons) lines.push(`  · ${r}`);
  const step = result.steps[rec.loops] ?? result.steps[0];
  if (step) {
    lines.push(
      `  · Aave v3.3 small-position: ${step.risk.smallPosition} (threshold ${formatMoney(result.input.market.smallPositionUsd)}); close factor at liquidation ${formatPct(step.risk.closeFactorAtLiquidation)}; fully liquidatable in one call: ${step.risk.fullyLiquidatableInOneCall}; effective HF floor ${step.risk.effectiveMinHealthFactor.toFixed(2)}`,
      `  · seed breakdown: liquid ${formatMoney(result.seedBreakdown.liquid)} / deployed ${formatMoney(result.seedBreakdown.deployed)} / collateral ${formatMoney(result.seedBreakdown.collateral)} / borrowed ${formatMoney(result.seedBreakdown.borrowedAgainst)} / entry costs ${formatMoney(result.seedBreakdown.entryCosts)}`,
    );
  }
  return lines.join('\n');
}

export function formatStress(results: StressResult[]): string {
  const lines = ['Stress tests (estimates, not realized):', ''];
  for (const r of results) {
    lines.push(`## ${r.scenario.label}`);
    if (r.liquidation) {
      const L = r.liquidation;
      lines.push(
        `  started HF<1: ${L.startedAtHfBelowOne}  closeFactor ${formatPct(L.closeFactor)}  one-call: ${L.fullyLiquidatableInOneCall}  calls ${L.calls}`,
        `  bonus cost ${formatMoney(L.bonusCostUsd)}  equity after ${formatMoney(L.equityAfter)}  bad debt ${formatMoney(L.badDebt)}`,
      );
    }
    if (r.result) {
      const rec = r.result.recommendation;
      lines.push(
        `  action ${rec.action} loops=${rec.loops} estimated net-on-seed ${formatPct(rec.netYieldOnSeed)} clearsHurdle=${rec.clearsHurdle} stop=${r.result.stopReason}`,
      );
    }
    for (const n of r.notes) lines.push(`  · ${n}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function formatCompare(
  results: { name: string; result: SimulationResult; looped?: SimulationResult }[],
): string {
  const lines = ['Mainnet vs L2, $1,000 seed (estimates at snapshot, not realized)', ''];
  for (const { name, result, looped } of results) {
    const rec = result.recommendation;
    const s = result.steps[rec.loops] ?? result.steps[0]!;
    const loop1 = looped?.steps[1] ?? result.steps[1];
    lines.push(
      `${name}`,
      `  cumulative entry costs after 1 forced loop: ${loop1 ? formatMoney(loop1.entryCostsUsd) : formatMoney(s.entryCostsUsd)}  (setup-only ${formatMoney(result.steps[0]!.entryCostsUsd)})`,
      `  recommend ${rec.action} loops=${rec.loops}  estimated net-on-seed ${formatPct(rec.netYieldOnSeed)}  estimated net ROE ${formatPct(rec.netRoe)}`,
      `  stop: ${result.stopReason}`,
      '',
    );
  }
  return lines.join('\n');
}
