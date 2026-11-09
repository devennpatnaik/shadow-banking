import { ZERO, type Decimal } from '@shadow-banking/core';
import type { AllocationUse, RiskStateName } from './types.js';

export interface AllocatorInput {
  netEarnings: Decimal;
  riskState: RiskStateName;
  nav: Decimal;
  debt: Decimal;
  liquidReserves: Decimal;
  reserveRequired: Decimal;
  upcomingExpenses: Decimal;
  liquidationDistance: Decimal | null;
  /** Evaluation hurdle only — never a mandate to take more risk. */
  hurdleApy: Decimal;
  /** Projection, not realized. Null means no attractive deployment is modeled. */
  estimatedNetYieldApy: Decimal | null;
}

export interface AllocatorSlice {
  use: AllocationUse;
  amount: Decimal;
  share: Decimal;
  reason: string;
}

export interface AllocatorResult {
  kind: 'recommendation';
  executes: false;
  riskState: RiskStateName;
  netEarnings: Decimal;
  totalAllocated: Decimal;
  uses: AllocatorSlice[];
  holdLiquid: boolean;
  notes: string[];
}

function push(
  uses: AllocatorSlice[],
  remaining: Decimal,
  use: AllocationUse,
  want: Decimal,
  reason: string,
): Decimal {
  if (remaining.lte(0) || want.lte(0)) return remaining;
  const amount = remaining.lt(want) ? remaining : want;
  const existing = uses.find((u) => u.use === use);
  if (existing) {
    existing.amount = existing.amount.plus(amount);
    existing.reason = `${existing.reason} ${reason}`;
  } else {
    uses.push({ use, amount, share: ZERO, reason });
  }
  return remaining.minus(amount);
}

/**
 * Retained-earnings allocator stub (spec §9). Recommendation only — does not execute.
 * Compounding must not automatically increase leverage. "Do nothing / hold liquid" is valid.
 */
export function recommendRetainedEarnings(input: AllocatorInput): AllocatorResult {
  const notes: string[] = [
    'Recommendation only; this stub does not execute transfers, repayments, or purchases.',
    'Compounding should increase equity and productive capacity, not automatically increase leverage.',
    `${input.hurdleApy.mul(100).toFixed(0)}% annualized net is an evaluation hurdle, not a promised return.`,
  ];
  const uses: AllocatorSlice[] = [];
  const earnings = input.netEarnings;
  if (earnings.lte(0)) {
    notes.push(
      'Net earnings are non-positive; no retained-earnings allocation. Review reserves and debt from existing assets.',
    );
    if (input.riskState === 'Emergency' || input.riskState === 'Deleveraging') {
      notes.push(
        `${input.riskState}: prefer repay debt and raise reserves from existing liquid assets.`,
      );
    }
    return {
      kind: 'recommendation',
      executes: false,
      riskState: input.riskState,
      netEarnings: earnings,
      totalAllocated: ZERO,
      uses,
      holdLiquid: true,
      notes,
    };
  }

  let remaining = earnings;
  const reserveGap = input.reserveRequired.gt(input.liquidReserves)
    ? input.reserveRequired.minus(input.liquidReserves)
    : ZERO;
  const weakHf = input.liquidationDistance !== null && input.liquidationDistance.lt('0.15');

  remaining = push(
    uses,
    remaining,
    'fund_expenses',
    input.upcomingExpenses,
    'Cover disclosed upcoming expenses before reinvestment.',
  );

  switch (input.riskState) {
    case 'Emergency':
      remaining = push(uses, remaining, 'repay_debt', input.debt, 'Emergency: repay debt first.');
      remaining = push(
        uses,
        remaining,
        'raise_reserves',
        remaining,
        'Emergency: hold remainder as liquid reserves.',
      );
      notes.push('Emergency: survival over yield. No new yield assets.');
      break;
    case 'Deleveraging':
      if (weakHf) {
        remaining = push(
          uses,
          remaining,
          'add_collateral',
          remaining.mul('0.5'),
          'Deleveraging with thin liquidation distance: add collateral.',
        );
      }
      remaining = push(uses, remaining, 'repay_debt', input.debt, 'Deleveraging: repay debt.');
      remaining = push(
        uses,
        remaining,
        'raise_reserves',
        remaining,
        'Deleveraging: remainder to reserves.',
      );
      notes.push('Deleveraging: no new yield-asset purchases.');
      break;
    case 'Caution':
      remaining = push(
        uses,
        remaining,
        'raise_reserves',
        reserveGap,
        'Caution: fill reserve gap; stop increasing leverage.',
      );
      remaining = push(
        uses,
        remaining,
        'repay_debt',
        input.debt,
        'Caution: consider debt reduction.',
      );
      remaining = push(
        uses,
        remaining,
        'raise_reserves',
        remaining,
        'Caution: hold remainder liquid.',
      );
      notes.push('Caution: do not buy additional yield assets from retained earnings.');
      break;
    case 'Normal': {
      remaining = push(
        uses,
        remaining,
        'raise_reserves',
        reserveGap,
        'Maintain liquidity reserve before deployment.',
      );
      if (weakHf && input.debt.gt(0)) {
        remaining = push(
          uses,
          remaining,
          'add_collateral',
          remaining.mul('0.3'),
          'Health is thin; top up collateral rather than adding leverage.',
        );
      }
      const est = input.estimatedNetYieldApy;
      const clears = est !== null && est.gte(input.hurdleApy);
      if (!clears) {
        remaining = push(
          uses,
          remaining,
          'raise_reserves',
          remaining,
          'No modeled deployment clears the evaluation hurdle; retain earnings in liquid form.',
        );
        notes.push('Hold liquid: estimated net yield is missing or below the evaluation hurdle.');
      } else if (input.debt.gt(0) && est !== null && est.lt(input.hurdleApy.plus('0.02'))) {
        remaining = push(
          uses,
          remaining,
          'repay_debt',
          remaining,
          'Marginal yield barely clears hurdle; prefer repay over expansion.',
        );
      } else {
        remaining = push(
          uses,
          remaining,
          'buy_yield_assets',
          remaining,
          'Normal: estimated net yield clears the evaluation hurdle; acquire yield assets with earnings (no new borrow).',
        );
      }
      break;
    }
  }

  if (remaining.gt(0)) {
    remaining = push(
      uses,
      remaining,
      'raise_reserves',
      remaining,
      'Unallocated remainder held liquid.',
    );
  }

  const total = uses.reduce((s, u) => s.plus(u.amount), ZERO);
  for (const u of uses) u.share = total.gt(0) ? u.amount.div(total) : ZERO;
  const holdLiquid = uses.every(
    (u) => u.use === 'raise_reserves' || u.use === 'fund_expenses' || u.use === 'repay_debt',
  );

  return {
    kind: 'recommendation',
    executes: false,
    riskState: input.riskState,
    netEarnings: earnings,
    totalAllocated: total,
    uses: uses.filter((u) => u.amount.gt(0)),
    holdLiquid,
    notes,
  };
}
