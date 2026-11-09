import { d } from '@shadow-banking/core';
import { aaveMarket, correlatedStoppingRule, uncorrelatedStoppingRule } from './defaults.js';
import type { CostInput, SimulationInput, TxAction } from './types.js';
import { TX_ACTIONS } from './types.js';

/**
 * Dated snapshots (2026-10-21). Sources are recorded on each preset. These are estimates
 * captured from public pages / the companion `docs/data/market-snapshot-2026-10-21.json`
 * file; they are not live quotes and not realized returns.
 */

function gasMap(values: Partial<Record<TxAction, number>>): Record<TxAction, ReturnType<typeof d>> {
  const out = {} as Record<TxAction, ReturnType<typeof d>>;
  for (const a of TX_ACTIONS) out[a] = d(values[a] ?? 0);
  return out;
}

const ETHEREUM_GAS: CostInput = {
  network: 'ethereum',
  gasUsdPerAction: gasMap({
    approve: 0.045,
    supply: 0.215,
    borrow: 0.235,
    repay: 0.127,
    withdraw: 0.196,
    swap: 0.176,
    setEMode: 0.059,
    bridge: 0.108,
  }),
  swapFeeRate: d('0.0001'),
  slippageRate: d('0.0002'),
  bridgingFixedUsd: d(0),
  bridgingRate: d(0),
  gasBasisLabel: 'ethereum planning 0.40 gwei, ETH $2,445.37 (snapshot 2026-10-21, usdAtPlanning)',
};

const ARBITRUM_GAS: CostInput = {
  network: 'arbitrum',
  gasUsdPerAction: gasMap({
    approve: 0.02,
    supply: 0.05,
    borrow: 0.05,
    repay: 0.05,
    withdraw: 0.05,
    swap: 0.01,
    setEMode: 0.02,
    bridge: 0.01,
  }),
  swapFeeRate: d('0.0001'),
  slippageRate: d('0.0002'),
  bridgingFixedUsd: d(0),
  bridgingRate: d(0),
  gasBasisLabel: 'arbitrum planning receipts (snapshot 2026-10-21, usdAtPlanning)',
};

const BASE_GAS: CostInput = {
  network: 'base',
  gasUsdPerAction: gasMap({
    approve: 0.01,
    supply: 0.03,
    borrow: 0.03,
    repay: 0.03,
    withdraw: 0.03,
    swap: 0.005,
    setEMode: 0.01,
    bridge: 0.01,
  }),
  swapFeeRate: d('0.0001'),
  slippageRate: d('0.0002'),
  bridgingFixedUsd: d(0),
  bridgingRate: d(0),
  gasBasisLabel: 'base planning receipts (snapshot 2026-10-21, usdAtPlanning)',
};

const SOLANA_GAS: CostInput = {
  network: 'solana',
  gasUsdPerAction: gasMap({
    approve: 0.001,
    supply: 0.002,
    borrow: 0.002,
    repay: 0.002,
    withdraw: 0.002,
    swap: 0.002,
    setEMode: 0,
    bridge: 0,
  }),
  swapFeeRate: d('0.0005'),
  slippageRate: d('0.0005'),
  bridgingFixedUsd: d(0),
  bridgingRate: d(0),
  gasBasisLabel: 'solana fee estimate (not in the 2026-10-21 snapshot file; labelled optional)',
};

function baseInput(
  partial: Omit<
    SimulationInput,
    | 'includeUnwindCosts'
    | 'notes'
    | 'policy'
    | 'stopping'
    | 'seedUsd'
    | 'reserveRate'
    | 'reserveYieldApy'
    | 'horizonDays'
  > & {
    notes: string[];
  },
): Pick<
  SimulationInput,
  'label' | 'presetId' | 'snapshotDate' | 'collateral' | 'borrow' | 'market' | 'costs' | 'notes'
> {
  return partial;
}

const PRESET_DEFS = {
  'aave-v3-ethereum-wsteth-eth-emode': {
    ...baseInput({
      label: 'Aave v3 Core wstETH/ETH E-mode on Ethereum (2026-10-21)',
      presetId: 'aave-v3-ethereum-wsteth-eth-emode',
      snapshotDate: '2026-10-21',
      collateral: {
        symbol: 'wstETH',
        priceUsd: d('3034.78'),
        yieldApy: d('0.0222'),
        volatility: d('0.08'),
      },
      borrow: { symbol: 'WETH', priceUsd: d('2445.37'), variableBorrowApy: d('0.0196') },
      market: aaveMarket({
        protocol: 'aave-v3-core',
        network: 'ethereum',
        ltv: '0.93',
        liquidationThreshold: '0.95',
        liquidationBonus: '0.01',
        eMode: true,
        eModeCategory: 'ETH correlated (id 1)',
      }),
      costs: ETHEREUM_GAS,
      notes: [
        'Collateral yield: Lido 7-day APR 2.22% (lido.fi APR calculator, 2026-10-21). Estimate, net of Lido 10% fee.',
        'Borrow APY: Aave v3 Core WETH 1.96% (aavetracker.com/markets/ethereum/weth, 2026-10-21T02:00Z). Estimate.',
        'E-mode LTV/LT/bonus 93%/95%/1% (dash.tools.aave.com, 2026-10-21).',
        'Gas: etherscan + Aave v3.2 gas report, planning 0.40 gwei. See docs/data/market-snapshot-2026-10-21.json.',
        'Relative volatility 8% is an assumption for wstETH/ETH depeg, not a historical estimator.',
      ],
    }),
    stopping: correlatedStoppingRule(),
  },
  'aave-v3-arbitrum-wsteth-eth-emode': {
    ...baseInput({
      label: 'Aave v3 wstETH/ETH liquid E-mode on Arbitrum (2026-10-21)',
      presetId: 'aave-v3-arbitrum-wsteth-eth-emode',
      snapshotDate: '2026-10-21',
      collateral: {
        symbol: 'wstETH',
        priceUsd: d('3034.78'),
        yieldApy: d('0.0222'),
        volatility: d('0.08'),
      },
      borrow: { symbol: 'WETH', priceUsd: d('2445.37'), variableBorrowApy: d('0.0197') },
      market: aaveMarket({
        protocol: 'aave-v3',
        network: 'arbitrum',
        ltv: '0.94',
        liquidationThreshold: '0.96',
        liquidationBonus: '0.01',
        eMode: true,
        eModeCategory: 'wstETH/WETH ETH Correlated (liquid E-mode)',
      }),
      costs: ARBITRUM_GAS,
      notes: [
        'Same Lido 2.22% yield assumption as mainnet (wstETH is the same asset).',
        'Borrow APY: Aave v3 Arbitrum WETH 1.97% (aavetracker.com/markets/arbitrum/weth, 2026-10-21T02:53Z). Estimate.',
        'Liquid E-mode LTV/LT/bonus 94%/96%/1% (aavetracker.com/markets/arbitrum/wsteth, 2026-10-21T05:18Z).',
        'Gas: L2 planning receipts from l2gastracker.com / openchainbench (2026-10-21 snapshot).',
      ],
    }),
    stopping: correlatedStoppingRule(),
  },
  'aave-v3-base-wsteth-eth-emode': {
    ...baseInput({
      label: 'Aave v3 wstETH/ETH liquid E-mode on Base (2026-10-21)',
      presetId: 'aave-v3-base-wsteth-eth-emode',
      snapshotDate: '2026-10-21',
      collateral: {
        symbol: 'wstETH',
        priceUsd: d('3034.78'),
        yieldApy: d('0.0222'),
        volatility: d('0.08'),
      },
      borrow: { symbol: 'WETH', priceUsd: d('2445.37'), variableBorrowApy: d('0.0205') },
      market: aaveMarket({
        protocol: 'aave-v3',
        network: 'base',
        ltv: '0.93',
        liquidationThreshold: '0.95',
        liquidationBonus: '0.02',
        eMode: true,
        eModeCategory: 'wstETH/WETH (liquid E-mode)',
      }),
      costs: BASE_GAS,
      notes: [
        'Borrow APY: Aave v3 Base WETH 2.05% (aavetracker.com/markets/base, 2026-10-21T04:16Z). Estimate.',
        'Aave Risk Stewards (Sep 2026) judged the wstETH loop on Base negative-carry at a 2.29% borrow rate — this snapshot is barely positive before costs (2.22% − 2.05%).',
        'Liquid E-mode 93%/95%/2% bonus (governance.aave.com LRT unification).',
      ],
    }),
    stopping: correlatedStoppingRule(),
  },
  'kamino-solana-jitosol-sol': {
    ...baseInput({
      label: 'Optional: Kamino jitoSOL/SOL loop on Solana (2026-10-21, partial snapshot)',
      presetId: 'kamino-solana-jitosol-sol',
      snapshotDate: '2026-10-21',
      collateral: {
        symbol: 'jitoSOL',
        priceUsd: d('138.24'),
        yieldApy: d('0.0448'),
        volatility: d('0.12'),
      },
      borrow: { symbol: 'SOL', priceUsd: d('105.82'), variableBorrowApy: d('0.0547') },
      market: aaveMarket({
        protocol: 'kamino-lend',
        network: 'solana',
        ltv: '0.65',
        liquidationThreshold: '0.75',
        liquidationBonus: '0.05',
        eMode: false,
      }),
      costs: SOLANA_GAS,
      notes: [
        'OPTIONAL preset. jitoSOL yield 4.48% from the 2026-10-21 snapshot; SOL price $105.82. jitoSOL price was null in the snapshot and is filled from CoinGecko 2026-10-21 ($138.24) for sizing only.',
        'Borrow APY 5.47% and LTV 0.65 are DefiLlama Kamino-lend readings from 2026-10-21, not in the snapshot file. Carry is negative before costs (4.48% − 5.47%).',
        'Not an Aave market: close-factor fields still use Aave-shaped defaults so the risk object is comparable; they are not Kamino protocol parameters.',
      ],
    }),
    stopping: uncorrelatedStoppingRule(),
  },
} as const;

export type PresetId = keyof typeof PRESET_DEFS;

export const PRESET_IDS = Object.keys(PRESET_DEFS) as PresetId[];

export interface PresetBuildOptions {
  seedUsd?: ReturnType<typeof d>;
  reserveRate?: ReturnType<typeof d>;
  horizonDays?: number;
  loops?: SimulationInput['policy'];
  includeUnwindCosts?: boolean;
  hurdleApy?: ReturnType<typeof d>;
}

export function buildPreset(id: string, opts: PresetBuildOptions = {}): SimulationInput {
  const def = PRESET_DEFS[id as PresetId];
  if (!def) throw new Error(`unknown preset "${id}". Known: ${PRESET_IDS.join(', ')}`);
  const stopping = opts.hurdleApy ? { ...def.stopping, hurdleApy: opts.hurdleApy } : def.stopping;
  return {
    ...def,
    seedUsd: opts.seedUsd ?? d(1000),
    reserveRate: opts.reserveRate ?? d('0.20'),
    reserveYieldApy: d('0.0386'),
    horizonDays: opts.horizonDays ?? 365,
    policy: opts.loops ?? { kind: 'optimal' },
    stopping,
    includeUnwindCosts: opts.includeUnwindCosts !== false,
  };
}

export function listPresets(): { id: PresetId; label: string; snapshotDate: string }[] {
  return PRESET_IDS.map((id) => ({
    id,
    label: PRESET_DEFS[id].label,
    snapshotDate: PRESET_DEFS[id].snapshotDate,
  }));
}
