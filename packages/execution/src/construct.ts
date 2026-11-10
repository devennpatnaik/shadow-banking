import { d, type Decimal } from '@shadow-banking/core';
import type { ActionIntent } from '@shadow-banking/risk';
import {
  AAVE_V3_ETHEREUM,
  PLACEHOLDER_USER,
  REFERRAL_CODE,
  SELECTORS,
  SIGNATURES,
  VARIABLE_RATE_MODE,
  DEFAULT_NETWORK,
} from './addresses.js';
import { encodeAddress, encodeCall, encodeUint, toBaseUnits } from './abi.js';
import type { CalldataDescriptor, ProposedAction, SdkCallDescriptor, VenueId } from './types.js';

const GAS: Record<string, string> = {
  supply: '180000',
  borrow: '250000',
  repay: '200000',
  withdraw: '220000',
  approve: '46000',
  hold: '0',
  unwind: '0',
  open_hedge: '0',
  close_hedge: '0',
  swap: '150000',
  stake: '180000',
};

const GAS_USD: Record<string, string> = {
  supply: '0.04',
  borrow: '0.05',
  repay: '0.04',
  withdraw: '0.05',
  approve: '0.01',
  hold: '0',
  unwind: '0',
  open_hedge: '0',
  close_hedge: '0',
  swap: '0.03',
  stake: '0.04',
};

export interface ConstructOptions {
  network?: string;
  user?: string;
  collateralSymbol?: string;
  debtSymbol?: string;
  includeHedgeStub?: boolean;
}

function tokenFor(symbol: string): { symbol: string; address: string } {
  const s = symbol.toUpperCase();
  if (s === 'WSTETH') return { symbol: 'wstETH', address: AAVE_V3_ETHEREUM.wstETH };
  if (s === 'WETH' || s === 'ETH') return { symbol: 'WETH', address: AAVE_V3_ETHEREUM.weth };
  if (s === 'USDC') return { symbol: 'USDC', address: AAVE_V3_ETHEREUM.usdc };
  return { symbol, address: AAVE_V3_ETHEREUM.wstETH };
}

function aaveCall(
  fn: 'supply' | 'borrow' | 'repay' | 'withdraw' | 'approve',
  token: string,
  amount: bigint,
  user: string,
): CalldataDescriptor {
  const to = fn === 'approve' ? token : AAVE_V3_ETHEREUM.pool;
  let args: string[];
  let data: string;
  if (fn === 'supply') {
    args = [token, amount.toString(), user, String(REFERRAL_CODE)];
    data = encodeCall(SELECTORS.supply, [
      encodeAddress(token),
      encodeUint(amount),
      encodeAddress(user),
      encodeUint(BigInt(REFERRAL_CODE)),
    ]);
  } else if (fn === 'withdraw') {
    args = [token, amount.toString(), user];
    data = encodeCall(SELECTORS.withdraw, [
      encodeAddress(token),
      encodeUint(amount),
      encodeAddress(user),
    ]);
  } else if (fn === 'borrow') {
    args = [token, amount.toString(), String(VARIABLE_RATE_MODE), String(REFERRAL_CODE), user];
    data = encodeCall(SELECTORS.borrow, [
      encodeAddress(token),
      encodeUint(amount),
      encodeUint(BigInt(VARIABLE_RATE_MODE)),
      encodeUint(BigInt(REFERRAL_CODE)),
      encodeAddress(user),
    ]);
  } else if (fn === 'repay') {
    args = [token, amount.toString(), String(VARIABLE_RATE_MODE), user];
    data = encodeCall(SELECTORS.repay, [
      encodeAddress(token),
      encodeUint(amount),
      encodeUint(BigInt(VARIABLE_RATE_MODE)),
      encodeAddress(user),
    ]);
  } else {
    args = [AAVE_V3_ETHEREUM.pool, amount.toString()];
    data = encodeCall(SELECTORS.approve, [
      encodeAddress(AAVE_V3_ETHEREUM.pool),
      encodeUint(amount),
    ]);
  }
  return {
    to,
    selector: SELECTORS[fn],
    signature: SIGNATURES[fn],
    args,
    data,
    valueWei: '0',
  };
}

function sdkAave(method: string, args: SdkCallDescriptor['args']): SdkCallDescriptor {
  return { package: '@aave/client', method, args };
}

function sdkHl(method: string, args: SdkCallDescriptor['args']): SdkCallDescriptor {
  return { package: '@nktkas/hyperliquid', method, args };
}

function gasFor(name: string): { gas: string; usd: string } {
  return { gas: GAS[name] ?? '21000', usd: GAS_USD[name] ?? '0.01' };
}

function action(
  partial: Omit<ProposedAction, 'estimatedGas' | 'estimatedGasUsd'> & {
    estimatedGas?: string;
    estimatedGasUsd?: string;
  },
): ProposedAction {
  const g = gasFor(partial.functionName);
  return {
    ...partial,
    estimatedGas: partial.estimatedGas ?? g.gas,
    estimatedGasUsd: partial.estimatedGasUsd ?? g.usd,
  };
}

function aaveVenue(intent: ActionIntent): VenueId {
  if (intent.venue === 'hyperliquid') return 'hyperliquid';
  if (intent.kind === 'open_hedge' || intent.kind === 'close_hedge') return 'hyperliquid';
  if (intent.kind === 'hold') return 'none';
  return 'aave-v3';
}

function constructOne(intent: ActionIntent, opts: ConstructOptions): ProposedAction[] {
  const user = opts.user ?? PLACEHOLDER_USER;
  const network = opts.network ?? DEFAULT_NETWORK;
  const coll = tokenFor(opts.collateralSymbol ?? 'wstETH');
  const debt = tokenFor(opts.debtSymbol ?? 'WETH');
  const amount = toBaseUnits(intent.notionalUsd);
  const venue = aaveVenue(intent);

  if (intent.kind === 'hold') {
    return [
      action({
        id: `${intent.id}-hold`,
        intentId: intent.id,
        venue: 'none',
        kind: 'hold',
        functionName: 'hold',
        notionalUsd: intent.notionalUsd,
        tokenSymbol: 'USDC',
        tokenAddress: AAVE_V3_ETHEREUM.usdc,
        network,
        sdk: {
          package: '@shadow-banking/execution',
          method: 'holdLiquid',
          args: { notionalUsd: intent.notionalUsd.toString() },
        },
        calldata: null,
        notes: ['Hold liquid. No calldata. Do not open loops, hedges, or LP.'],
      }),
    ];
  }

  if (intent.kind === 'open_hedge' || intent.kind === 'close_hedge') {
    const reduce = intent.kind === 'close_hedge';
    return [
      action({
        id: `${intent.id}-hl`,
        intentId: intent.id,
        venue: 'hyperliquid',
        kind: intent.kind,
        functionName: intent.kind,
        notionalUsd: intent.notionalUsd,
        tokenSymbol: 'ETH',
        tokenAddress: null,
        network: 'hyperliquid',
        sdk: sdkHl('order', {
          coin: 'ETH',
          isBuy: reduce,
          sz: intent.notionalUsd.toString(),
          isolated: true,
          leverage: 2,
          reduceOnly: reduce,
        }),
        calldata: null,
        notes: [
          'Hyperliquid hedge is an SDK stub. No simulation endpoint; no order is sent.',
          'Agent wallets must not withdraw. Phase 5 never broadcasts.',
        ],
      }),
    ];
  }

  const map: Partial<Record<ActionIntent['kind'], 'supply' | 'borrow' | 'repay' | 'withdraw'>> = {
    supply: 'supply',
    stake: 'supply',
    add_collateral: 'supply',
    borrow: 'borrow',
    repay: 'repay',
    withdraw: 'withdraw',
    unwind: 'withdraw',
  };
  const fn = map[intent.kind];
  if (fn) {
    const tok = fn === 'borrow' || fn === 'repay' ? debt : coll;
    const notes: string[] = [];
    if (intent.kind === 'stake')
      notes.push('Paper stake maps to Aave v3 supply of wstETH (already wrapped).');
    if (intent.kind === 'unwind')
      notes.push('Unwind withdraw is the last on-chain step after repay.');
    const out: ProposedAction[] = [];
    if (fn === 'supply') {
      out.push(
        action({
          id: `${intent.id}-approve`,
          intentId: intent.id,
          venue: 'aave-v3',
          kind: intent.kind,
          functionName: 'approve',
          notionalUsd: intent.notionalUsd,
          tokenSymbol: tok.symbol,
          tokenAddress: tok.address,
          network,
          sdk: sdkAave('approve', {
            token: tok.address,
            spender: AAVE_V3_ETHEREUM.pool,
            amount: amount.toString(),
          }),
          calldata: aaveCall('approve', tok.address, amount, user),
          notes: ['Sized ERC-20 approval. No infinite allowance.'],
        }),
      );
    }
    out.push(
      action({
        id: `${intent.id}-${fn}`,
        intentId: intent.id,
        venue: 'aave-v3',
        kind: intent.kind,
        functionName: fn,
        notionalUsd: intent.notionalUsd,
        tokenSymbol: tok.symbol,
        tokenAddress: tok.address,
        network,
        sdk: sdkAave(fn, {
          asset: tok.address,
          amount: amount.toString(),
          onBehalfOf: user,
          interestRateMode: fn === 'borrow' || fn === 'repay' ? VARIABLE_RATE_MODE : null,
        }),
        calldata: aaveCall(fn, tok.address, amount, user),
        notes,
      }),
    );
    return out;
  }

  if (intent.kind === 'swap') {
    return [
      action({
        id: `${intent.id}-swap`,
        intentId: intent.id,
        venue: 'aave-v3',
        kind: 'swap',
        functionName: 'swap',
        notionalUsd: intent.notionalUsd,
        tokenSymbol: coll.symbol,
        tokenAddress: coll.address,
        network,
        sdk: {
          package: '@uniswap/universal-router-sdk',
          method: 'execute',
          args: {
            tokenIn: AAVE_V3_ETHEREUM.usdc,
            tokenOut: coll.address,
            amountIn: amount.toString(),
            maxSlippage: '0.005',
          },
        },
        calldata: null,
        notes: ['Swap is a Universal Router descriptor stub. No aggregator MCP payloads.'],
      }),
    ];
  }

  return [
    action({
      id: `${intent.id}-noop`,
      intentId: intent.id,
      venue,
      kind: intent.kind,
      functionName: intent.kind,
      notionalUsd: intent.notionalUsd,
      tokenSymbol: coll.symbol,
      tokenAddress: coll.address,
      network,
      sdk: {
        package: '@shadow-banking/execution',
        method: 'describe',
        args: { kind: intent.kind, notionalUsd: intent.notionalUsd.toString() },
      },
      calldata: null,
      notes: [`No on-chain mapping for kind ${intent.kind}; recorded as a descriptor only.`],
    }),
  ];
}

export function constructActions(
  intents: readonly ActionIntent[],
  opts: ConstructOptions = {},
): ProposedAction[] {
  const out: ProposedAction[] = [];
  for (const intent of intents) {
    out.push(...constructOne(intent, opts));
  }
  if (opts.includeHedgeStub && !intents.some((i) => i.kind === 'open_hedge')) {
    const notional: Decimal = intents[0]?.notionalUsd ?? d(0);
    out.push(
      ...constructOne(
        {
          id: 'hedge-stub',
          kind: 'open_hedge',
          venue: 'hyperliquid',
          notionalUsd: notional,
          riskIncreasing: true,
        },
        opts,
      ),
    );
  }
  return out;
}
