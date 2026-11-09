import { describe, expect, it } from 'vitest';
import { d, type DisclosureProfileInput } from '@shadow-banking/core';
import { resolveCapital } from '../src/capital.js';
import { compareStrategies, strategiesClearingHurdle } from '../src/compare.js';
import { resolveMarket } from '../src/market.js';
import { comparisonToJson } from '../src/serialize.js';
import type { ComparisonInput } from '../src/types.js';
import { fixtureSnapshot } from './fixture-snapshot.js';

function run(opts: {
  lstYield?: number;
  borrowApy?: number;
  usdcSupply?: number;
  fundingApr?: number;
  hurdle?: string;
  reserveRate?: string;
  disclosure?: DisclosureProfileInput;
}): ReturnType<typeof compareStrategies> {
  const snapshot = fixtureSnapshot({
    ...(opts.lstYield !== undefined ? { lstYield: opts.lstYield } : {}),
    ...(opts.borrowApy !== undefined ? { borrowApy: opts.borrowApy } : {}),
    ...(opts.usdcSupply !== undefined ? { usdcSupply: opts.usdcSupply } : {}),
    ...(opts.fundingApr !== undefined ? { fundingApr: opts.fundingApr } : {}),
  });
  const seed = d(1000);
  const hurdle = d(opts.hurdle ?? '0.10');
  const market = resolveMarket({ snapshot, seedUsd: seed, hurdleApy: hurdle });
  const capitalArgs = {
    seedUsd: seed,
    hurdleApy: hurdle,
    reserveRate: d(opts.reserveRate ?? '0'),
  };
  const capital = resolveCapital(
    opts.disclosure ? { ...capitalArgs, disclosure: opts.disclosure } : capitalArgs,
  );
  const input: ComparisonInput = {
    market,
    capital,
    hurdleApy: hurdle,
    horizonDays: 365,
    includeUnwindCosts: false,
    hedgedLongShare: d('0.60'),
  };
  return compareStrategies(input);
}

describe('comparison and hurdle', () => {
  it('recommends preserve-capital when nothing clears the 10% hurdle', () => {
    const r = run({ lstYield: 0.0222, borrowApy: 0.0196, usdcSupply: 0.0386, fundingApr: 0.088 });
    expect(r.recommendation.action).toBe('preserve-capital');
    expect(r.recommendation.strategyId).toBe('preserve-liquid');
    expect(r.recommendation.clearsHurdle).toBe(false);
    expect(strategiesClearingHurdle(r)).toHaveLength(0);
    const ids = r.evaluations.map((e) => e.id);
    expect(ids).toEqual([
      'preserve-liquid',
      'hold-lst',
      'loop-2x',
      'loop-3x',
      'hedged-carry',
      'lp',
    ]);
  });

  it('can deploy when a strategy clears a lower hurdle', () => {
    const r = run({
      lstYield: 0.15,
      borrowApy: 0.02,
      usdcSupply: 0.04,
      fundingApr: 0.01,
      hurdle: '0.10',
      reserveRate: '0',
    });
    expect(r.recommendation.action).toBe('deploy');
    expect(r.recommendation.clearsHurdle).toBe(true);
    const clearing = strategiesClearingHurdle(r).map((e) => e.id);
    expect(clearing).toContain('hold-lst');
    expect(clearing).toContain('loop-2x');
    expect(clearing).toContain('loop-3x');
  });

  it('still preserves capital if only the liquid sleeve clears the hurdle', () => {
    const r = run({
      lstYield: 0.01,
      borrowApy: 0.02,
      usdcSupply: 0.04,
      fundingApr: 0,
      hurdle: '0.03',
    });
    expect(r.evaluations.find((e) => e.id === 'preserve-liquid')?.clearsHurdle).toBe(true);
    expect(r.recommendation.action).toBe('preserve-capital');
  });

  it('JSON payload keeps gross, estimated net, and realized-capable fields separate', () => {
    const r = run({ lstYield: 0.0222, usdcSupply: 0.0386, fundingApr: 0.088 });
    const json = comparisonToJson(r);
    const hold = (json.evaluations as Record<string, unknown>[])[1] as Record<string, unknown>;
    const y = hold['yield'] as Record<string, unknown>;
    expect(y['grossApy']).toBeTruthy();
    expect(y['estimatedNetApy']).toBeTruthy();
    expect((y['realized'] as Record<string, unknown>)['capable']).toBe(false);
    expect((json.recommendation as Record<string, unknown>)['action']).toBe('preserve-capital');
  });
});

describe('disclosures', () => {
  const baseDisclosure = {
    income: { monthlyNet: 0, stability: 'none' as const },
    recurringExpenses: [],
    existingDebts: [],
    emergencySavings: 0,
    nearTermCashNeeds: [],
    horizonMonths: 12,
    riskTolerance: 'moderate' as const,
    tax: { residencyCountry: 'US' },
  };

  it('skips loops when leverage is prohibited and still recommends preserve-capital', () => {
    const r = run({
      lstYield: 0.15,
      usdcSupply: 0.04,
      hurdle: '0.10',
      disclosure: {
        ...baseDisclosure,
        restrictions: {
          allowLeverage: false,
          allowDerivatives: false,
          excludedAssetClasses: ['lp_position'],
        },
      },
    });
    expect(r.evaluations.find((e) => e.id === 'loop-2x')?.eligible).toBe(false);
    expect(r.evaluations.find((e) => e.id === 'loop-3x')?.eligible).toBe(false);
    expect(r.evaluations.find((e) => e.id === 'hedged-carry')?.eligible).toBe(false);
    expect(r.evaluations.find((e) => e.id === 'lp')?.eligible).toBe(false);
    expect(r.evaluations.find((e) => e.id === 'hold-lst')?.eligible).toBe(true);
  });

  it('does not treat a disclosed household requirement as investable', () => {
    const r = run({
      disclosure: {
        ...baseDisclosure,
        income: { monthlyNet: 0, stability: 'none' },
        recurringExpenses: [{ label: 'rent', monthlyAmount: 2000 }],
        emergencySavings: 0,
      },
    });
    expect(r.capital.deployableUsd.toString()).toBe('0');
    expect(r.recommendation.action).toBe('preserve-capital');
    expect(r.evaluations.find((e) => e.id === 'hold-lst')?.eligible).toBe(false);
  });
});
