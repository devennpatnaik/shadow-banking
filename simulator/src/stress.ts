import { d, ONE, type Decimal } from '@shadow-banking/core';
import { simulateLoop } from './loop.js';
import { liquidateOnce, closeFactor } from './risk.js';
import type { SimulationInput, SimulationResult } from './types.js';

export type StressKind =
  | 'collateral-price-shock'
  | 'borrow-rate-spike'
  | 'yield-compression'
  | 'withdrawal-freeze'
  | 'liquidation-cascade';

export interface StressScenario {
  kind: StressKind;
  label: string;
  /** Multiply collateral mark (relative to borrow) by this. 0.85 = −15% LST/ETH. */
  collateralPriceMult?: Decimal;
  borrowApyMult?: Decimal;
  yieldApyMult?: Decimal;
  extraSlippage?: Decimal;
  /** After a freeze, unwind is only via DEX with this extra haircut. */
  freeze?: boolean;
}

export const DEFAULT_STRESSES: StressScenario[] = [
  {
    kind: 'collateral-price-shock',
    label: 'Collateral relative price −15% (LST/ETH depeg)',
    collateralPriceMult: d('0.85'),
  },
  {
    kind: 'borrow-rate-spike',
    label: 'Borrow APY ×2.5 (May-2026-style spike to ~4.9%)',
    borrowApyMult: d('2.5'),
  },
  {
    kind: 'yield-compression',
    label: 'Collateral yield ×0.5',
    yieldApyMult: d('0.5'),
  },
  {
    kind: 'withdrawal-freeze',
    label: 'Primary withdrawal frozen; DEX exit with +2% slippage',
    freeze: true,
    extraSlippage: d('0.02'),
  },
  {
    kind: 'liquidation-cascade',
    label: 'Liquidation cascade at HF < 1 with Aave v3.3 close factor (100% if small)',
  },
];

export interface StressResult {
  scenario: StressScenario;
  result: SimulationResult | null;
  liquidation?: {
    startedAtHfBelowOne: boolean;
    closeFactor: Decimal;
    fullyLiquidatableInOneCall: boolean;
    bonusCostUsd: Decimal;
    equityAfter: Decimal;
    badDebt: Decimal;
    calls: number;
  };
  notes: string[];
}

function applyScenario(input: SimulationInput, s: StressScenario): SimulationInput {
  const collateral = { ...input.collateral };
  const borrow = { ...input.borrow };
  const costs = { ...input.costs };
  const notes = [...input.notes, `STRESS (estimate): ${s.label}`];
  if (s.collateralPriceMult) collateral.priceUsd = collateral.priceUsd.mul(s.collateralPriceMult);
  if (s.yieldApyMult) collateral.yieldApy = collateral.yieldApy.mul(s.yieldApyMult);
  if (s.borrowApyMult) borrow.variableBorrowApy = borrow.variableBorrowApy.mul(s.borrowApyMult);
  if (s.extraSlippage) costs.slippageRate = costs.slippageRate.plus(s.extraSlippage);
  if (s.freeze) {
    notes.push('Withdrawal freeze: cannot rely on the primary queue; unwind path is DEX-only.');
  }
  return { ...input, collateral, borrow, costs, notes };
}

export function runStress(input: SimulationInput, scenario: StressScenario): StressResult {
  if (scenario.kind === 'liquidation-cascade') {
    const base = simulateLoop(input);
    const rec = base.steps[base.recommendation.loops] ?? base.steps[0]!;
    const shocked = rec.collateralUsd.mul(d('0.80'));
    const hfNumerator = shocked.mul(input.market.liquidationThreshold);
    const startedAtHfBelowOne = rec.debtUsd.gt(0) && hfNumerator.lt(rec.debtUsd);
    const { closeFactor: cf, smallPosition } = closeFactor(
      input.market,
      shocked,
      rec.debtUsd,
      d('0.99'),
    );
    let col = shocked;
    let debt = rec.debtUsd;
    let bonus = d(0);
    let bad = d(0);
    let calls = 0;
    while (debt.gt(0) && col.gt(0) && calls < 8) {
      const hf = col.mul(input.market.liquidationThreshold).div(debt);
      if (hf.gte(ONE)) break;
      const step = liquidateOnce(col, debt, input.market.liquidationBonus, cf);
      col = step.collateralUsd;
      debt = step.debtUsd;
      bonus = bonus.plus(step.bonusCost);
      bad = bad.plus(step.badDebt);
      calls += 1;
    }
    return {
      scenario,
      result: null,
      liquidation: {
        startedAtHfBelowOne,
        closeFactor: cf,
        fullyLiquidatableInOneCall: cf.eq(ONE),
        bonusCostUsd: bonus,
        equityAfter: col.minus(debt),
        badDebt: bad,
        calls,
      },
      notes: [
        `Applied a −20% collateral mark to the recommended step (HF ${rec.risk.healthFactor?.toFixed(3) ?? 'n/a'}).`,
        smallPosition
          ? `Small-position rule: close factor 100% (one call can seize the whole book).`
          : `Close factor ${cf.mul(100).toFixed(0)}%.`,
        'Bonus cost is the extra collateral paid to liquidators. Estimate, not a realized liquidation.',
      ],
    };
  }
  const stressed = applyScenario(input, scenario);
  return {
    scenario,
    result: simulateLoop(stressed),
    notes: stressed.notes.slice(-2),
  };
}

export function runDefaultStresses(input: SimulationInput): StressResult[] {
  return DEFAULT_STRESSES.map((s) => runStress(input, s));
}
