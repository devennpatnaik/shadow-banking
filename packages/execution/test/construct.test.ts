import { describe, expect, it } from 'vitest';
import { d } from '@shadow-banking/core';
import { constructActions } from '../src/construct.js';
import { accountingImpact } from '../src/impact.js';
import { checkPolicy, defaultPolicy } from '../src/policy.js';
import { presetProposal } from '../src/presets.js';
import { mockSimulator } from '../src/simulate.js';
import { unwindPlan } from '../src/unwind.js';
import { observationFromBook, fixtureBook, paperDisclosure } from '@shadow-banking/risk';
import { AAVE_V3_ETHEREUM, SELECTORS } from '../src/addresses.js';

describe('proposal construction', () => {
  it('hold-liquid has no calldata and an empty unwind', () => {
    const p = presetProposal('hold-liquid');
    const actions = constructActions(p.intents);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.functionName).toBe('hold');
    expect(actions[0]?.calldata).toBeNull();
    expect(actions[0]?.sdk.method).toBe('holdLiquid');
    const unwind = unwindPlan(actions);
    expect(unwind.steps).toEqual([]);
    expect(unwind.usesT2Liquidity).toBe(false);
  });

  it('loop-step builds Aave supply (with approve) and borrow calldata', () => {
    const p = presetProposal('loop-step', '0.12');
    const actions = constructActions(p.intents);
    const fns = actions.map((a) => a.functionName);
    expect(fns).toEqual(['approve', 'supply', 'borrow']);
    const supply = actions.find((a) => a.functionName === 'supply');
    expect(supply?.calldata?.to).toBe(AAVE_V3_ETHEREUM.pool);
    expect(supply?.calldata?.selector).toBe(SELECTORS.supply);
    expect(supply?.calldata?.data.startsWith(SELECTORS.supply)).toBe(true);
    expect(supply?.sdk.package).toBe('@aave/client');
    const borrow = actions.find((a) => a.functionName === 'borrow');
    expect(borrow?.calldata?.selector).toBe(SELECTORS.borrow);
    const unwind = unwindPlan(actions);
    expect(unwind.steps.map((s) => s.functionName)).toEqual(['repay', 'withdraw']);
  });

  it('optional Hyperliquid hedge is an SDK stub without calldata', () => {
    const actions = constructActions(
      [{ id: 'h', kind: 'open_hedge', notionalUsd: d(100), riskIncreasing: true }],
      {},
    );
    expect(actions[0]?.venue).toBe('hyperliquid');
    expect(actions[0]?.calldata).toBeNull();
    expect(actions[0]?.sdk.package).toBe('@nktkas/hyperliquid');
  });

  it('mock simulator is offline and ok', () => {
    const actions = constructActions(presetProposal('loop-step', '0.12').intents);
    const sim = mockSimulator().simulate(actions);
    expect(sim.simulator).toBe('mock');
    expect(sim.ok).toBe(true);
    expect(sim.dryRun).toBe(true);
    expect(sim.rpcUrlSet).toBe(false);
    expect(Number(sim.gasUsed)).toBeGreaterThan(0);
  });

  it('accounting impact keeps NAV and raises paper debt on borrow', () => {
    const obs = observationFromBook(fixtureBook('normal'), paperDisclosure());
    const actions = constructActions(presetProposal('loop-step', '0.12').intents);
    const impact = accountingImpact(obs, actions);
    expect(impact.pre.nav).toBe(impact.post.nav);
    expect(d(impact.post.debt).gt(d(impact.pre.debt))).toBe(true);
  });

  it('policy stub rejects oversize notional', () => {
    const actions = constructActions([
      {
        id: 'big',
        kind: 'borrow',
        notionalUsd: d(900),
        riskIncreasing: true,
        expectedNetReturn: d('0.12'),
      },
    ]);
    const check = checkPolicy(actions, { ...defaultPolicy(), perTxUsdMax: d(500) });
    expect(check.ok).toBe(false);
    expect(check.spendingOk).toBe(false);
  });
});
