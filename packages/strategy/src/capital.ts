import {
  d,
  DEFAULT_RESERVE_POLICY,
  deployableCapital,
  holdingValue,
  parseDisclosureProfile,
  strategyReserve,
  ZERO,
  type Decimal,
  type DisclosureProfile,
  type DisclosureProfileInput,
  type BalanceSheet,
} from '@shadow-banking/core';
import type { CapitalPlan } from './types.js';

const DEFAULT_RESERVE_RATE = d('0.20');

export interface ResolveCapitalArgs {
  seedUsd: Decimal;
  reserveRate?: Decimal;
  hurdleApy: Decimal;
  disclosure?: DisclosureProfile | DisclosureProfileInput;
  balanceSheet?: BalanceSheet;
}

function liquidOwnerFromSheet(bs: BalanceSheet): Decimal {
  const managed = new Set(bs.accounts.filter((a) => a.scope === 'managed').map((a) => a.id));
  let total = ZERO;
  for (const h of bs.holdings) {
    if (!managed.has(h.accountId)) continue;
    if (h.asset.liquidityTier === 'T0' || h.asset.liquidityTier === 'T1') {
      total = total.plus(holdingValue(h));
    }
  }
  return total;
}

/**
 * Deployable capital is never the entire observed bank balance. With only `--seed`, the
 * seed is already the managed deposit; a 10–30% strategy reserve (default 20%) is held
 * liquid. With a disclosure (and optional balance sheet), `packages/core` derives the
 * household requirement and the strategy reserve.
 */
export function resolveCapital(args: ResolveCapitalArgs): CapitalPlan {
  const notes: string[] = [];
  const profile = args.disclosure ? parseDisclosureProfile(args.disclosure) : undefined;
  const liquidFromSheet = args.balanceSheet ? liquidOwnerFromSheet(args.balanceSheet) : undefined;
  const liquidOwner = liquidFromSheet ?? args.seedUsd;

  if (profile) {
    const policy = {
      ...DEFAULT_RESERVE_POLICY,
      ...(args.reserveRate ? { strategyReserveRate: args.reserveRate } : {}),
    };
    const dep = deployableCapital(profile, liquidOwner, policy, { hurdleApy: args.hurdleApy });
    const reserved = strategyReserve(dep.deployable, profile, policy);
    notes.push(...dep.notes, ...reserved.notes);
    if (liquidFromSheet) {
      notes.push(
        `Liquid managed T0/T1 from the balance sheet (${liquidFromSheet.toFixed(2)}) used as owner capital; observed-only accounts are not deployable.`,
      );
    }
    return {
      seedUsd: args.seedUsd,
      deployableUsd: dep.deployable,
      reserveUsd: reserved.amount,
      reserveRate: reserved.rate,
      investableUsd: reserved.investable,
      householdRequirementUsd: dep.uncoveredRequirement,
      shortfallUsd: dep.shortfall,
      notes,
      leverageAllowed: profile.restrictions.allowLeverage,
      derivativesAllowed: profile.restrictions.allowDerivatives,
      lpAllowed: !profile.restrictions.excludedAssetClasses.includes('lp_position'),
    };
  }

  const rate = args.reserveRate ?? DEFAULT_RESERVE_RATE;
  if (rate.lt(0) || rate.gte(1)) throw new RangeError('reserveRate must be in [0, 1)');
  const deployable = args.seedUsd;
  const reserveUsd = deployable.mul(rate);
  if (rate.lt('0.10') || rate.gt('0.30')) {
    notes.push(
      `Strategy reserve rate ${rate.mul(100).toFixed(1)}% is outside the 10–30% starting range; make sure this is deliberate.`,
    );
  }
  notes.push(
    `No disclosure supplied: treating --seed ${args.seedUsd.toFixed(2)} as already-deployable capital and holding ${rate.mul(100).toFixed(0)}% as the strategy liquidity reserve.`,
  );
  return {
    seedUsd: args.seedUsd,
    deployableUsd: deployable,
    reserveUsd,
    reserveRate: rate,
    investableUsd: deployable.minus(reserveUsd),
    householdRequirementUsd: ZERO,
    shortfallUsd: ZERO,
    notes,
    leverageAllowed: true,
    derivativesAllowed: true,
    lpAllowed: true,
  };
}
