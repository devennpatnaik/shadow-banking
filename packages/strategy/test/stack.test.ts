import { describe, expect, it } from 'vitest';
import { d } from '@shadow-banking/core';
import { resolveCapital } from '../src/capital.js';
import { composeStack } from '../src/compose.js';
import { resolveMarket } from '../src/market.js';
import { stackToJson } from '../src/serialize.js';
import type { ComparisonInput } from '../src/types.js';
import { fixtureSnapshot } from './fixture-snapshot.js';

function input(opts: {
  lstYield?: number;
  borrowApy?: number;
  usdcSupply?: number;
  hurdle?: string;
  reserveRate?: string;
  seed?: string;
}): ComparisonInput {
  const snapshot = fixtureSnapshot({
    ...(opts.lstYield !== undefined ? { lstYield: opts.lstYield } : {}),
    ...(opts.borrowApy !== undefined ? { borrowApy: opts.borrowApy } : {}),
    ...(opts.usdcSupply !== undefined ? { usdcSupply: opts.usdcSupply } : {}),
  });
  const seed = d(opts.seed ?? '1000');
  const hurdle = d(opts.hurdle ?? '0.10');
  const market = resolveMarket({ snapshot, seedUsd: seed, hurdleApy: hurdle });
  const capital = resolveCapital({
    seedUsd: seed,
    hurdleApy: hurdle,
    reserveRate: d(opts.reserveRate ?? '0.20'),
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

describe('capital stack composer', () => {
  it('is reserve-only at $1k when LST carry is below the 10% hurdle', () => {
    const stack = composeStack(input({ lstYield: 0.0222, borrowApy: 0.0196, usdcSupply: 0.0386 }));
    expect(stack.legs.map((l) => l.kind)).toEqual(['liquidity_reserve']);
    expect(stack.noDeployment).toBe(true);
    expect(stack.recommendedAction).toBe('hold_liquid');
    expect(stack.clearsHurdle).toBe(false);
    expect(stack.borrowedCapitalUsd.toString()).toBe('0');
    expect(stack.nextProposedLeg?.kind).toBe('productive_asset');
  });

  it('composes at least 3 concurrent legs on a stressed-yield $1k book', () => {
    const stack = composeStack(input({ lstYield: 0.25, borrowApy: 0.02, usdcSupply: 0.04 }));
    const kinds = stack.legs.map((l) => l.kind);
    expect(kinds[0]).toBe('liquidity_reserve');
    expect(kinds).toContain('productive_asset');
    expect(kinds).toContain('collateral_post');
    expect(kinds.length).toBeGreaterThanOrEqual(3);
    expect(stack.noDeployment).toBe(false);
    expect(stack.recommendedAction).toBe('operate_paper');
    expect(stack.clearsHurdle).toBe(true);
    expect(stack.ownerEquityUsd.toString()).toBe('1000');
    const json = stackToJson(stack);
    expect(Array.isArray(json['legs'])).toBe(true);
    expect((json['legs'] as unknown[]).length).toBeGreaterThanOrEqual(3);
  });

  it('clears a multi-leg stack at higher seed with elevated LST yield', () => {
    const stack = composeStack(
      input({
        lstYield: 0.25,
        borrowApy: 0.02,
        usdcSupply: 0.04,
        seed: '50000',
        reserveRate: '0.20',
      }),
    );
    expect(stack.legs.length).toBeGreaterThanOrEqual(3);
    expect(stack.clearsHurdle).toBe(true);
    expect(stack.borrowedCapitalUsd.gt(0)).toBe(true);
  });

  it('does not double-count owner equity when the same LST is posted as collateral', () => {
    const stack = composeStack(input({ lstYield: 0.25, borrowApy: 0.02 }));
    const productive = stack.legs.find((l) => l.kind === 'productive_asset');
    const collateral = stack.legs.find((l) => l.kind === 'collateral_post');
    expect(productive).toBeTruthy();
    expect(collateral).toBeTruthy();
    expect(collateral!.ownerEquityUsd.toString()).toBe('0');
    expect(stack.ownerEquityUsd.toString()).toBe('1000');
  });
});
