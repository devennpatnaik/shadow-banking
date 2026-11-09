import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { d } from '@shadow-banking/core';
import {
  parseMarketSnapshot,
  simulationInputFromSnapshot,
  simulateLoop,
} from '@shadow-banking/simulator';
import { compareStrategies, resolveCapital, resolveMarket } from '@shadow-banking/strategy';
import { applyPatches } from '../src/merge.js';
import { defaultFixturePath } from '../src/paths.js';
import { fixturePatch } from '../src/providers/fixture.js';

const FIXTURE = defaultFixturePath();

describe('strategy + simulator consume refreshed files', () => {
  it('fixture overlay with live-shaped Aave numbers still loads', () => {
    const { snapshot } = fixturePatch(FIXTURE);
    const merged = applyPatches(
      snapshot,
      [
        {
          provider: 'aave',
          asOf: '2026-11-09T12:00:00.000Z',
          source: 'https://api.v3.aave.com/graphql',
          quality: 'ok',
          degradations: [],
          markets: [
            {
              protocol: 'aave-v3-core',
              network: 'ethereum',
              asset: 'WETH',
              supplyApy: 0.0142,
              borrowApy: 0.0203,
              ltv: 0.81,
              liquidationThreshold: 0.84,
              liquidationBonus: 0.05,
              eMode: {
                category: 'ETH correlated (id 1)',
                ltv: 0.93,
                liquidationThreshold: 0.95,
                liquidationBonus: 0.01,
                collateral: true,
                borrowable: true,
              },
              source: 'https://api.v3.aave.com/graphql',
              asOf: '2026-11-09T12:00:00.000Z',
            },
          ],
          assets: [
            {
              symbol: 'ETH',
              network: 'ethereum',
              priceUsd: 2140.01,
              yieldApy: 0,
              source: 'https://api.v3.aave.com/graphql',
              asOf: '2026-11-09T12:00:00.000Z',
            },
          ],
        },
      ],
      {
        mode: 'live',
        ranAt: '2026-11-09T12:00:00.000Z',
        providers: ['fixture', 'aave'],
        quality: { aave: 'ok' },
        degradations: [],
        cacheDir: '/tmp',
        networkUsed: true,
      },
    );
    const parsed = parseMarketSnapshot(merged);
    const market = resolveMarket({ snapshot: parsed, seedUsd: d(1000), hurdleApy: d('0.10') });
    expect(market.borrowApy.toString()).toBe('0.0203');
    const capital = resolveCapital({ seedUsd: d(1000), hurdleApy: d('0.10'), reserveRate: d(0) });
    const cmp = compareStrategies({
      market,
      capital,
      hurdleApy: d('0.10'),
      horizonDays: 365,
      includeUnwindCosts: true,
      hedgedLongShare: d('0.60'),
    });
    expect(cmp.evaluations.length).toBeGreaterThan(0);
    const sim = simulateLoop(
      simulationInputFromSnapshot({
        snapshot: parsed,
        network: 'ethereum',
        collateralSymbol: 'wstETH',
        borrowSymbol: 'WETH',
        seedUsd: d(1000),
        reserveRate: d('0.2'),
      }),
    );
    expect(sim.steps.length).toBeGreaterThan(0);
  });

  it('canonical dated file is unchanged as a schema fixture', () => {
    const raw = JSON.parse(readFileSync(FIXTURE, 'utf8')) as unknown;
    const snap = parseMarketSnapshot(raw);
    expect(snap.snapshotDate).toBe('2026-10-21');
  });
});
