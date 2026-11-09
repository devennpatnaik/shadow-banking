import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { d } from '@shadow-banking/core';
import { resolveCapital } from '../src/capital.js';
import { compareStrategies, strategiesClearingHurdle } from '../src/compare.js';
import { parseSnapshot, resolveMarket } from '../src/market.js';

const SNAPSHOT_PATH = resolve(
  import.meta.dirname,
  '../../../docs/data/market-snapshot-2026-10-21.json',
);

describe('dated market snapshot 2026-10-21 (offline file, no network)', () => {
  it('no candidate clears the 10% net hurdle; recommend preserve capital', () => {
    const snapshot = parseSnapshot(JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as unknown);
    const seed = d(1000);
    const hurdle = d('0.10');
    const market = resolveMarket({ snapshot, seedUsd: seed, hurdleApy: hurdle });
    const capital = resolveCapital({ seedUsd: seed, hurdleApy: hurdle, reserveRate: d(0) });
    const result = compareStrategies({
      market,
      capital,
      hurdleApy: hurdle,
      horizonDays: 365,
      includeUnwindCosts: true,
      hedgedLongShare: d('0.60'),
    });

    expect(market.lstYieldApy.toString()).toBe('0.0222');
    expect(market.borrowApy.toString()).toBe('0.0196');
    expect(market.usdcSupplyApy.toString()).toBe('0.0386');
    expect(market.hyperliquid.fundingApr.toString()).toBe('0.088');

    expect(strategiesClearingHurdle(result).map((e) => e.id)).toEqual([]);
    expect(result.recommendation.action).toBe('preserve-capital');
    expect(result.recommendation.clearsHurdle).toBe(false);

    const byId = Object.fromEntries(result.evaluations.map((e) => [e.id, e]));
    const preserve = byId['preserve-liquid']!;
    const hold = byId['hold-lst']!;
    const loop2 = byId['loop-2x']!;
    const loop3 = byId['loop-3x']!;
    const carry = byId['hedged-carry']!;
    const lp = byId['lp']!;

    // Ballpark vs docs/economics-1k.md §5 (cheap rails, 12-month net). Execution
    // paths differ by a few dollars of gas, so we check to ~0.5pp not the cent.
    expect(Number(preserve.yield.estimatedNetApy)).toBeGreaterThan(0.035);
    expect(Number(preserve.yield.estimatedNetApy)).toBeLessThan(0.04);
    expect(Number(hold.yield.estimatedNetApy)).toBeGreaterThan(0.015);
    expect(Number(hold.yield.estimatedNetApy)).toBeLessThan(0.025);
    expect(Number(loop2.yield.estimatedNetApy)).toBeGreaterThan(0.015);
    expect(Number(loop2.yield.estimatedNetApy)).toBeLessThan(0.03);
    expect(Number(loop3.yield.estimatedNetApy)).toBeGreaterThan(0.015);
    expect(Number(loop3.yield.estimatedNetApy)).toBeLessThan(0.035);
    expect(Number(carry.yield.estimatedNetApy)).toBeGreaterThan(0.05);
    expect(Number(carry.yield.estimatedNetApy)).toBeLessThan(0.075);
    expect(Number(lp.yield.estimatedNetApy)).toBeGreaterThan(0.015);
    expect(Number(lp.yield.estimatedNetApy)).toBeLessThan(0.03);

    expect(Number(loop2.risk.healthFactor)).toBeGreaterThan(1.85);
    expect(Number(loop2.risk.healthFactor)).toBeLessThan(1.95);
    expect(Number(loop3.risk.healthFactor)).toBeGreaterThan(1.38);
    expect(Number(loop3.risk.healthFactor)).toBeLessThan(1.48);
    expect(Number(carry.risk.hedgeLiquidationDistance)).toBeGreaterThan(0.6);
    expect(Number(carry.risk.hedgeLiquidationDistance)).toBeLessThan(0.7);
    expect(loop2.risk.fullyLiquidatableInOneCall).toBe(true);
    expect(loop3.risk.fullyLiquidatableInOneCall).toBe(true);
  });
});
