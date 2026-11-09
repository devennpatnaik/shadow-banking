import { describe, expect, it } from 'vitest';
import { d } from '@shadow-banking/core';
import { evaluateProposal } from '../src/evaluate.js';
import {
  correlatedLendingBook,
  fixtureBook,
  paperDisclosure,
  uncorrelatedLendingBook,
} from '../src/fixtures.js';
import { initialMemory, tick } from '../src/machine.js';
import { observationFromBook } from '../src/observe.js';
import type { Proposal, RiskMemory } from '../src/types.js';

const disc = paperDisclosure();

describe('fixture balance sheets land in the documented states', () => {
  it('normal idle book is Normal, no veto', () => {
    const obs = observationFromBook(fixtureBook('normal'), disc);
    const t = tick(obs);
    expect(t.state).toBe('Normal');
    expect(t.veto).toBe(false);
    expect(t.recommendedAction).toBe('operate_paper');
    expect(t.metrics.smallPosition).toBe(false);
    expect(t.metrics.healthFactor).toBeNull();
  });

  it('caution book is Caution via HF/LD, not a veto', () => {
    const obs = observationFromBook(fixtureBook('caution'), disc);
    const t = tick(obs);
    expect(obs.healthFactor).not.toBeNull();
    expect(obs.healthFactor!.lt('1.60')).toBe(true);
    expect(obs.healthFactor!.gte('1.35')).toBe(true);
    expect(t.state).toBe('Caution');
    expect(t.veto).toBe(false);
    expect(t.noDeployment).toBe(true);
    expect(t.recommendedAction).toBe('add_reserves');
    expect(
      t.triggers.some((x) => x.metric.includes('healthFactor') || x.metric.includes('ld')),
    ).toBe(true);
  });

  it('deleveraging book vetoes', () => {
    const obs = observationFromBook(fixtureBook('deleveraging'), disc);
    const t = tick(obs);
    expect(t.state).toBe('Deleveraging');
    expect(t.veto).toBe(true);
    expect(t.recommendedAction).toBe('deleverage');
    expect(t.mandated.length).toBeGreaterThan(0);
  });

  it('emergency book vetoes and mandates unwind', () => {
    const obs = observationFromBook(fixtureBook('emergency'), disc);
    const t = tick(obs);
    expect(t.state).toBe('Emergency');
    expect(t.veto).toBe(true);
    expect(t.recommendedAction).toBe('unwind');
    expect(t.mandated.some((m) => m.kind === 'unwind')).toBe(true);
  });
});

describe('hysteresis and dwell', () => {
  it('does not drop Caution until HF clears +0.10 and 6h dwell', () => {
    const entered: RiskMemory = {
      state: 'Caution',
      enteredAt: '2026-10-21T00:00:00Z',
      latchedEmergency: false,
    };
    const recovered = observationFromBook(
      uncorrelatedLendingBook({
        collateralUsd: d(5000),
        debtUsd: d(2500),
        reserveUsd: d(800),
        asOf: '2026-10-21T03:00:00Z',
      }),
      disc,
      { netDirectional: d(0) },
    );
    // HF = 0.83*5000/2500 = 1.66, Caution entry 1.60, need 1.70 to exit. Size > $2k so no small-position buffer.
    expect(recovered.smallPosition).toBe(false);
    expect(recovered.healthFactor!.toFixed(2)).toBe('1.66');
    const still = tick(recovered, { memory: entered, now: '2026-10-21T03:00:00Z' });
    expect(still.state).toBe('Caution');

    const clearHf = observationFromBook(
      uncorrelatedLendingBook({
        collateralUsd: d(5000),
        debtUsd: d('2331.46'),
        reserveUsd: d(800),
        asOf: '2026-10-21T03:00:00Z',
      }),
      disc,
      { netDirectional: d(0) },
    );
    // HF = 2490/1400 = 1.778 > 1.70 but dwell only 3h
    const early = tick(clearHf, { memory: entered, now: '2026-10-21T03:00:00Z' });
    expect(early.state).toBe('Caution');

    const done = tick(clearHf, { memory: entered, now: '2026-10-21T07:00:00Z' });
    expect(done.state).toBe('Normal');
  });

  it('upward transitions skip; downward go one state at a time', () => {
    const emerg = observationFromBook(fixtureBook('emergency'), disc);
    const fromNormal = tick(emerg, { memory: initialMemory(emerg.asOf) });
    expect(fromNormal.previousState).toBe('Normal');
    expect(fromNormal.state).toBe('Emergency');

    const recovered = observationFromBook(fixtureBook('normal'), disc);
    recovered.asOf = '2026-10-22T00:00:00Z';
    const down = tick(recovered, {
      memory: fromNormal.memory,
      now: recovered.asOf,
      humanAck: true,
      unwindComplete: true,
    });
    expect(down.state).toBe('Deleveraging');
  });

  it('Emergency stays latched without human acknowledgement', () => {
    const emerg = observationFromBook(fixtureBook('emergency'), disc);
    const once = tick(emerg);
    const idle = observationFromBook(fixtureBook('normal'), disc);
    idle.asOf = '2026-10-22T00:00:00Z';
    const held = tick(idle, { memory: once.memory, now: idle.asOf, humanAck: false });
    expect(held.state).toBe('Emergency');
    expect(held.memory.latchedEmergency || held.state === 'Emergency').toBe(true);
  });
});

describe('small-position Aave v3.3 buffer', () => {
  it('adds +0.10 HF to every band when collateral or debt is under $2,000', () => {
    // HF = 0.95 * 1500 / 1096.15 ≈ 1.30
    const book = correlatedLendingBook({
      collateralUsd: d(1500),
      debtUsd: d('1096.15'),
      reserveUsd: d(500),
    });
    const obs = observationFromBook(book, disc);
    expect(obs.smallPosition).toBe(true);
    expect(obs.correlated).toBe(true);
    const t = tick(obs);
    expect(t.limits.hfCaution.toString()).toBe('1.35');
    expect(t.state).toBe('Caution');
  });
});

describe('hard-limit veto of proposals', () => {
  it('rejects a risk-increasing borrow in Caution', () => {
    const obs = observationFromBook(fixtureBook('caution'), disc);
    const proposal: Proposal = {
      id: 'open',
      intents: [
        {
          id: 'borrow-1',
          kind: 'borrow',
          notionalUsd: d(200),
          expectedNetReturn: d('0.12'),
          expectedPostState: { healthFactor: d('1.80'), leverage: d('1.5') },
        },
      ],
    };
    const e = evaluateProposal(obs, proposal);
    expect(e.decision).toBe('reject');
    expect(e.veto).toBe(true);
    expect(e.intents[0]?.reasons.join(' ')).toMatch(/not permitted in Caution/);
  });

  it('rejects a Normal-state borrow that misses the post-action HF buffer or hurdle', () => {
    const obs = observationFromBook(fixtureBook('normal'), disc);
    const proposal: Proposal = {
      id: 'thin',
      intents: [
        {
          id: 'borrow-1',
          kind: 'borrow',
          notionalUsd: d(400),
          expectedNetReturn: d('0.04'),
          expectedPostState: { healthFactor: d('1.50'), leverage: d('1.4') },
        },
      ],
    };
    const e = evaluateProposal(obs, proposal);
    expect(e.decision).toBe('reject');
    const text = e.intents[0]?.reasons.join(' ') ?? '';
    expect(text).toMatch(/hurdle|HF/);
  });

  it('approves a repay in Deleveraging', () => {
    const obs = observationFromBook(fixtureBook('deleveraging'), disc);
    const proposal: Proposal = {
      id: 'repay',
      intents: [{ id: 'repay-1', kind: 'repay', notionalUsd: d(200), reducesRisk: true }],
    };
    const e = evaluateProposal(obs, proposal);
    expect(e.intents[0]?.decision).toBe('approve');
    expect(e.veto).toBe(true);
    expect(e.decision).toBe('approve');
  });
});
