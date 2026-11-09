import { describe, it, expect } from 'vitest';
import { d } from '@shadow-banking/core';
import { buildPreset, listPresets } from '../src/presets.js';
import { simulateLoop } from '../src/loop.js';
import { parseMarketSnapshot, simulationInputFromSnapshot } from '../src/snapshot.js';
import { runDefaultStresses } from '../src/stress.js';
import { closeFactor, liquidateOnce } from '../src/risk.js';
import { aaveMarket } from '../src/defaults.js';
import { liquidationTouchProbability, erf } from '../src/probability.js';

const SNAPSHOT = {
  schemaVersion: 1,
  snapshotDate: '2026-10-21',
  currency: 'USD',
  hurdle: 0.1,
  assets: [
    { symbol: 'ETH', network: 'ethereum', priceUsd: 2445.37, yieldApy: 0 },
    { symbol: 'wstETH', network: 'ethereum', priceUsd: 3034.78, yieldApy: 0.0222 },
    { symbol: 'WETH', network: 'ethereum', priceUsd: 2445.37, yieldApy: 0 },
    { symbol: 'USDC', network: 'ethereum', priceUsd: 1, yieldApy: 0.0323 },
  ],
  markets: [
    {
      protocol: 'aave-v3-core',
      network: 'ethereum',
      asset: 'WETH',
      borrowApy: 0.0196,
      ltv: 0.805,
      liquidationThreshold: 0.83,
      liquidationBonus: 0.05,
      eMode: {
        category: 'ETH correlated (id 1)',
        ltv: 0.93,
        liquidationThreshold: 0.95,
        liquidationBonus: 0.01,
        collateral: true,
        borrowable: true,
      },
    },
    {
      protocol: 'aave-v3-core',
      network: 'ethereum',
      asset: 'wstETH',
      borrowApy: 0.0003,
      ltv: 0.785,
      liquidationThreshold: 0.81,
      liquidationBonus: 0.06,
      eMode: {
        category: 'ETH correlated (id 1)',
        ltv: 0.93,
        liquidationThreshold: 0.95,
        liquidationBonus: 0.01,
        collateral: true,
        borrowable: false,
      },
    },
  ],
  costs: {
    gas: {
      ethereum: {
        ethPriceUsd: 2445.37,
        gasPriceGwei: { planning: 0.4, spot: 0.039 },
        actions: {
          approve: { gasUnits: 46000, usdAtPlanning: 0.045 },
          supply: { usdAtPlanning: 0.215 },
          borrow: { usdAtPlanning: 0.235 },
          repay: { usdAtPlanning: 0.127 },
          withdraw: { usdAtPlanning: 0.196 },
          swap: { usdAtPlanning: 0.176 },
          setEMode: { usdAtPlanning: 0.059 },
        },
      },
    },
    swap: { 'wstETH/ETH': { feeRate: 0.0001, priceImpactAt1000: 0.0002 } },
    bridging: { ethereumToL2: { protocolFeeRate: 0.0008, fixedUsd: 0.11 } },
    fiatRamp: {},
    hyperliquid: {},
  },
};

describe('presets', () => {
  it('ships at least two ecosystems with dated snapshots', () => {
    const ids = listPresets().map((p) => p.id);
    expect(ids).toContain('aave-v3-ethereum-wsteth-eth-emode');
    expect(ids).toContain('aave-v3-arbitrum-wsteth-eth-emode');
    for (const p of listPresets()) expect(p.snapshotDate).toBe('2026-10-21');
  });

  it('runs a $1,000 seed on mainnet and an L2 without network I/O', () => {
    const eth = simulateLoop(
      buildPreset('aave-v3-ethereum-wsteth-eth-emode', { seedUsd: d(1000) }),
    );
    const arb = simulateLoop(
      buildPreset('aave-v3-arbitrum-wsteth-eth-emode', { seedUsd: d(1000) }),
    );
    expect(eth.steps[0]!.entryCostsUsd.gt(arb.steps[0]!.entryCostsUsd)).toBe(true);
    expect(eth.recommendation.hurdleApy.toString()).toBe('0.1');
    expect(eth.steps[0]!.risk.smallPosition).toBe(true);
  });
});

describe('snapshot loader', () => {
  it('accepts the docs/data/market-snapshot-<date>.json shape', () => {
    const snap = parseMarketSnapshot(SNAPSHOT);
    const input = simulationInputFromSnapshot({
      snapshot: snap,
      network: 'ethereum',
      collateralSymbol: 'wstETH',
      borrowSymbol: 'WETH',
      seedUsd: d(1000),
      reserveRate: d('0.2'),
    });
    expect(input.market.ltv.toString()).toBe('0.93');
    expect(input.borrow.variableBorrowApy.toString()).toBe('0.0196');
    expect(input.costs.gasUsdPerAction.supply.toString()).toBe('0.215');
    const r = simulateLoop(input);
    expect(r.steps.length).toBeGreaterThan(0);
  });

  it('resolves WETH as ETH when the snapshot only lists ETH in assets[]', () => {
    const snap = parseMarketSnapshot({
      ...SNAPSHOT,
      assets: SNAPSHOT.assets.filter((a) => a.symbol !== 'WETH'),
    });
    const input = simulationInputFromSnapshot({
      snapshot: snap,
      network: 'ethereum',
      collateralSymbol: 'wstETH',
      borrowSymbol: 'WETH',
      seedUsd: d(1000),
      reserveRate: d('0.2'),
    });
    expect(input.borrow.priceUsd.toString()).toBe('2445.37');
  });
});

describe('stress and liquidation cascade', () => {
  it('runs the default stress set', () => {
    const results = runDefaultStresses(
      buildPreset('aave-v3-ethereum-wsteth-eth-emode', { seedUsd: d(1000) }),
    );
    expect(results).toHaveLength(5);
    const cascade = results.find((x) => x.scenario.kind === 'liquidation-cascade')!;
    expect(cascade.liquidation?.fullyLiquidatableInOneCall).toBe(true);
    expect(cascade.liquidation?.closeFactor.toString()).toBe('1');
  });

  it('one call at 100% close factor seizes debt × (1+bonus)', () => {
    const step = liquidateOnce(d(1500), d(1000), d('0.01'), d(1));
    expect(step.repaid.toString()).toBe('1000');
    expect(step.seized.toString()).toBe('1010');
    expect(step.bonusCost.toString()).toBe('10');
    expect(step.collateralUsd.toString()).toBe('490');
    expect(step.debtUsd.toString()).toBe('0');
  });

  it('close factor is 50% when the book is large and HF is not < 0.95', () => {
    const market = aaveMarket({
      protocol: 'aave',
      network: 'ethereum',
      ltv: '0.93',
      liquidationThreshold: '0.95',
      liquidationBonus: '0.01',
      eMode: true,
    });
    const { closeFactor: cf, smallPosition } = closeFactor(market, d(5000), d(3000), d('1.05'));
    expect(smallPosition).toBe(false);
    expect(cf.toString()).toBe('0.5');
  });
});

describe('probability helpers', () => {
  it('erf(0)=0 and CDF/touch probability stay in [0,1]', () => {
    expect(Math.abs(erf(0))).toBeLessThan(1e-8);
    const p = liquidationTouchProbability(0.2, 0.08, 1);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.05);
    expect(liquidationTouchProbability(0, 0.08, 1)).toBe(1);
    expect(liquidationTouchProbability(1, 0.08, 1)).toBe(0);
  });
});
