import type { MarketSnapshotFile } from '@shadow-banking/simulator';

/** Minimal in-memory snapshot. No network. Rates chosen for hand-checked arithmetic. */
export function fixtureSnapshot(
  patch: {
    lstYield?: number;
    borrowApy?: number;
    usdcSupply?: number;
    fundingApr?: number;
    hurdle?: number;
  } = {},
): MarketSnapshotFile {
  const lstYield = patch?.lstYield ?? 0.1;
  const borrowApy = patch?.borrowApy ?? 0.02;
  const usdcSupply = patch?.usdcSupply ?? 0.04;
  const fundingApr = patch?.fundingApr ?? 0.088;
  return {
    snapshotDate: 'test',
    hurdle: patch?.hurdle ?? 0.1,
    assets: [
      { symbol: 'wstETH', network: 'ethereum', priceUsd: 3000, yieldApy: lstYield },
      { symbol: 'ETH', network: 'ethereum', priceUsd: 2500, yieldApy: 0 },
      { symbol: 'USDC', network: 'base', priceUsd: 1, yieldApy: usdcSupply },
    ],
    markets: [
      {
        protocol: 'aave-v3-core',
        network: 'ethereum',
        asset: 'wstETH',
        supplyApy: 0,
        borrowApy: null,
        ltv: 0.785,
        liquidationThreshold: 0.81,
        liquidationBonus: 0.06,
        eMode: {
          category: 'ETH correlated',
          ltv: 0.93,
          liquidationThreshold: 0.95,
          liquidationBonus: 0.01,
        },
      },
      {
        protocol: 'aave-v3-core',
        network: 'ethereum',
        asset: 'WETH',
        supplyApy: 0.01,
        borrowApy,
        ltv: 0.8,
        liquidationThreshold: 0.83,
        liquidationBonus: 0.05,
        eMode: {
          category: 'ETH correlated',
          ltv: 0.93,
          liquidationThreshold: 0.95,
          liquidationBonus: 0.01,
        },
      },
      {
        protocol: 'aave-v3',
        network: 'base',
        asset: 'USDC',
        supplyApy: usdcSupply,
        borrowApy: 0.05,
        ltv: null,
        liquidationThreshold: null,
        liquidationBonus: null,
        eMode: null,
      },
    ],
    costs: {
      swap: {
        'wstETH/ETH': { feeRate: 0, priceImpactAt100: 0, priceImpactAt1000: 0 },
        'USDC/ETH': { feeRate: 0, priceImpactAt100: 0, priceImpactAt1000: 0 },
      },
      hyperliquid: {
        takerFeeRate: 0,
        makerFeeRate: 0,
        minOrderNotionalUsd: 10,
        minDepositUsdc: 5,
        withdrawalFeeUsdc: 0,
        ethMaxLeverage: 25,
        ethMaintenanceMarginRate: 0.02,
        funding: {
          ETH: {
            currentApr: fundingApr,
            avg30dApr: fundingApr,
            planningApr: 0.05,
            stressApr: -0.03,
          },
        },
      },
    },
  };
}
