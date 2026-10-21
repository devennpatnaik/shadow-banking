import { ZERO, type Decimal } from './money.js';

/**
 * Seed-deposit breakdown (spec §2C): how much of the deposit is immediately liquid, deployed
 * into productive assets, committed as collateral, borrowed against, and held as reserve —
 * with user-owned capital kept separate from borrowed capital.
 */

export interface SeedDeploymentPlan {
  seed: Decimal;
  /** Strategy contingency reserve kept liquid. */
  reserve: Decimal;
  /** One-off entry costs paid out of the seed (gas, swap fees, bridging). */
  entryCosts: Decimal;
  /** Owner capital that entered productive assets (after entry costs). */
  ownerDeployed: Decimal;
  /** Debt raised against the collateral. */
  borrowed: Decimal;
  /** Value of productive assets pledged as collateral (≤ deployed). */
  collateralCommitted: Decimal;
}

export interface SeedDepositBreakdown {
  seed: Decimal;
  /** Reserve + undeployed remainder. */
  liquid: Decimal;
  reserve: Decimal;
  idleLiquid: Decimal;
  entryCosts: Decimal;
  /** Total productive assets = owner deployed + borrowed proceeds that were redeployed. */
  deployed: Decimal;
  collateral: Decimal;
  borrowedAgainst: Decimal;
  ownerCapital: Decimal;
  borrowedCapital: Decimal;
  shareOfSeed: {
    liquid: Decimal;
    reserve: Decimal;
    deployed: Decimal;
    collateral: Decimal;
    entryCosts: Decimal;
  };
}

export function seedDepositBreakdown(plan: SeedDeploymentPlan): SeedDepositBreakdown {
  const { seed, reserve, entryCosts, ownerDeployed, borrowed, collateralCommitted } = plan;
  const nonneg: [string, Decimal][] = [
    ['seed', seed],
    ['reserve', reserve],
    ['entryCosts', entryCosts],
    ['ownerDeployed', ownerDeployed],
    ['borrowed', borrowed],
    ['collateralCommitted', collateralCommitted],
  ];
  for (const [name, v] of nonneg) {
    if (v.isNegative()) throw new RangeError(`${name} must be >= 0`);
  }
  const idleLiquid = seed.minus(reserve).minus(ownerDeployed).minus(entryCosts);
  if (idleLiquid.isNegative()) {
    throw new RangeError(
      `reserve + ownerDeployed + entryCosts (${reserve.plus(ownerDeployed).plus(entryCosts).toString()}) exceeds the seed (${seed.toString()})`,
    );
  }
  const deployed = ownerDeployed.plus(borrowed);
  if (collateralCommitted.gt(deployed)) {
    throw new RangeError('collateralCommitted cannot exceed total deployed assets');
  }
  if (borrowed.gt(0) && collateralCommitted.lte(0)) {
    throw new RangeError('borrowed > 0 requires collateralCommitted > 0');
  }
  const liquid = reserve.plus(idleLiquid);
  const share = (x: Decimal) => (seed.gt(0) ? x.div(seed) : ZERO);
  return {
    seed,
    liquid,
    reserve,
    idleLiquid,
    entryCosts,
    deployed,
    collateral: collateralCommitted,
    borrowedAgainst: borrowed,
    ownerCapital: seed.minus(entryCosts),
    borrowedCapital: borrowed,
    shareOfSeed: {
      liquid: share(liquid),
      reserve: share(reserve),
      deployed: share(deployed),
      collateral: share(collateralCommitted),
      entryCosts: share(entryCosts),
    },
  };
}
