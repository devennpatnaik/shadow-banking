import { describe, expect, it } from 'vitest';
import { d } from '@shadow-banking/core';
import { resolveCapital } from '../src/capital.js';
import {
  evaluateHedgedCarry,
  evaluateHoldLst,
  evaluateLoop2x,
  evaluateLoop3x,
  evaluateLp,
  evaluatePreserve,
} from '../src/candidates.js';
import { resolveMarket } from '../src/market.js';
import type { ComparisonInput } from '../src/types.js';
import { fixtureSnapshot } from './fixture-snapshot.js';

function input(patch?: {
  lstYield?: number;
  borrowApy?: number;
  usdcSupply?: number;
  fundingApr?: number;
  reserveRate?: string;
  seed?: string;
  hurdle?: string;
}): ComparisonInput {
  const snapshot = fixtureSnapshot(
    patch
      ? {
          ...(patch.lstYield !== undefined ? { lstYield: patch.lstYield } : {}),
          ...(patch.borrowApy !== undefined ? { borrowApy: patch.borrowApy } : {}),
          ...(patch.usdcSupply !== undefined ? { usdcSupply: patch.usdcSupply } : {}),
          ...(patch.fundingApr !== undefined ? { fundingApr: patch.fundingApr } : {}),
        }
      : {},
  );
  const seed = d(patch?.seed ?? '1000');
  const hurdle = d(patch?.hurdle ?? '0.10');
  const market = resolveMarket({ snapshot, seedUsd: seed, hurdleApy: hurdle });
  const capital = resolveCapital({
    seedUsd: seed,
    hurdleApy: hurdle,
    reserveRate: d(patch?.reserveRate ?? '0'),
  });
  return {
    market,
    capital,
    hurdleApy: hurdle,
    horizonDays: 365,
    includeUnwindCosts: false,
    hedgedLongShare: d('0.60'),
  };
}

describe('hand-checked strategy math (zero costs, zero reserve)', () => {
  it('preserve-liquid: $1,000 at 4% USDC supply → $40, 4.00% net', () => {
    const e = evaluatePreserve(input({ usdcSupply: 0.04 }));
    expect(e.yield.grossIncomeUsd.toString()).toBe('40');
    expect(e.yield.financingUsd.toString()).toBe('0');
    expect(e.yield.executionUsd.toString()).toBe('0');
    expect(e.yield.expectedLossUsd.toString()).toBe('0');
    expect(e.yield.estimatedNetUsd.toString()).toBe('40');
    expect(e.yield.estimatedNetApy.toString()).toBe('0.04');
    expect(e.yield.grossApy.toString()).toBe('0.04');
    expect(e.yield.realized.capable).toBe(false);
    expect(e.risk.healthFactor).toBeNull();
    expect(e.risk.leverage.toString()).toBe('1');
    expect(e.risk.directionalExposure.toString()).toBe('0');
    expect(e.clearsHurdle).toBe(false);
  });

  it('hold-LST: $1,000 at 10% yield, no debt → $100, 10% gross = net', () => {
    const e = evaluateHoldLst(input({ lstYield: 0.1 }));
    expect(e.deployedUsd.toString()).toBe('1000');
    expect(e.debtUsd.toString()).toBe('0');
    expect(e.yield.grossIncomeUsd.toString()).toBe('100');
    expect(e.yield.estimatedNetUsd.toString()).toBe('100');
    expect(e.yield.estimatedNetApy.toString()).toBe('0.1');
    expect(e.risk.directionalExposure.toString()).toBe('1');
  });

  it('loop 2x: collateral 2000, debt 1000, y=10%, b=2% → gross 200, interest 20, net 180, ROE 18%, HF 1.9', () => {
    const e = evaluateLoop2x(input({ lstYield: 0.1, borrowApy: 0.02 }));
    expect(e.debtUsd.toString()).toBe('1000');
    expect(e.deployedUsd.toString()).toBe('2000');
    expect(e.yield.grossIncomeUsd.toString()).toBe('200');
    expect(e.yield.financingUsd.toString()).toBe('20');
    expect(e.yield.grossIncomeUsd.minus(e.yield.financingUsd).toString()).toBe('180');
    // Spec §5: estimated net also subtracts expected liquidation loss (reuse simulator risk).
    expect(e.yield.estimatedNetUsd.toString()).toBe(
      e.yield.grossIncomeUsd.minus(e.yield.financingUsd).minus(e.yield.expectedLossUsd).toString(),
    );
    expect(e.yield.estimatedNetApy.lt('0.18')).toBe(true);
    expect(e.yield.grossApy.toString()).toBe('0.2');
    expect(e.risk.healthFactor?.toString()).toBe('1.9'); // 2000*0.95/1000
    expect(e.risk.liquidationDistance?.toFixed(10)).toBe('0.4736842105'); // 1-1/1.9
    expect(e.risk.leverage.toString()).toBe('2');
    expect(e.risk.smallPosition).toBe(true);
    expect(e.risk.fullyLiquidatableInOneCall).toBe(true);
  });

  it('loop 3x: carry = y+(k-1)(y-b) = 10% + 2*8% = 26%; HF = 3000*0.95/2000 = 1.425', () => {
    const e = evaluateLoop3x(input({ lstYield: 0.1, borrowApy: 0.02 }));
    expect(e.debtUsd.toString()).toBe('2000');
    expect(e.yield.grossIncomeUsd.toString()).toBe('300');
    expect(e.yield.financingUsd.toString()).toBe('40');
    expect(e.yield.grossIncomeUsd.minus(e.yield.financingUsd).toString()).toBe('260');
    expect(e.yield.estimatedNetUsd.toString()).toBe(
      e.yield.grossIncomeUsd.minus(e.yield.financingUsd).minus(e.yield.expectedLossUsd).toString(),
    );
    expect(e.yield.estimatedNetApy.lt('0.26')).toBe(true);
    expect(e.risk.healthFactor?.toString()).toBe('1.425');
    expect(e.risk.leverage.toString()).toBe('3');
  });

  it('hedged carry 60/40: staking 600*2.22% + funding 600*8.8% = 66.12 on $1,000', () => {
    const e = evaluateHedgedCarry(
      input({ lstYield: 0.0222, fundingApr: 0.088, usdcSupply: 0.0386 }),
    );
    expect(e.yield.grossIncomeUsd.toFixed(2)).toBe('66.12'); // 13.32 + 52.80
    expect(e.yield.financingUsd.toString()).toBe('0');
    expect(e.yield.estimatedNetUsd.toFixed(2)).toBe('66.12');
    expect(e.yield.estimatedNetApy.toFixed(4)).toBe('0.0661');
    expect(e.risk.leverage.toString()).toBe('1.5');
    expect(e.risk.hedgeLiquidationDistance?.toFixed(4)).toBe('0.6467'); // 1/1.5 - 0.02
    expect(e.risk.directionalExposure.toString()).toBe('0');
    expect(e.clearsHurdle).toBe(false);
  });

  it('LP: half the book earns LST yield; fee APR 1.3%; LVR 0.1%', () => {
    const e = evaluateLp(input({ lstYield: 0.0222 }));
    // staking 500*0.0222 = 11.1; fees 1000*0.013 = 13; LVR 1; net 23.1
    expect(e.yield.grossIncomeUsd.toFixed(2)).toBe('24.10');
    expect(e.yield.expectedLossUsd.toFixed(1)).toBe('1.0');
    expect(e.yield.estimatedNetUsd.toFixed(2)).toBe('23.10');
    expect(e.yield.estimatedNetApy.toFixed(4)).toBe('0.0231');
  });
});

describe('liquidity reserve blend', () => {
  it('20% reserve: hold-LST 10% on $800 plus 4% on $200 → 8.8% on $1,000', () => {
    const e = evaluateHoldLst(input({ lstYield: 0.1, usdcSupply: 0.04, reserveRate: '0.20' }));
    expect(e.equityUsd.toString()).toBe('800');
    expect(e.yield.estimatedNetUsd.toString()).toBe('80');
    expect(e.portfolioEstimatedNetUsd.toString()).toBe('88'); // 80 + 200*0.04
    expect(e.portfolioEstimatedNetApy.toString()).toBe('0.088');
    expect(e.portfolioClearsHurdle).toBe(false);
  });
});
