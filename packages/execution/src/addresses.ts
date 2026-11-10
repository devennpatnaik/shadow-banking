/**
 * Canonical public Aave v3 Ethereum Core addresses (not secrets).
 * Hyperliquid has no EVM calldata path; hedge actions are SDK stubs.
 */
export const AAVE_V3_ETHEREUM = {
  pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  wstETH: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
  weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
} as const;

/** Placeholder onBehalfOf / user — never a live key, never a funded wallet. */
export const PLACEHOLDER_USER = '0x0000000000000000000000000000000000000001';

/** Aave v3 IPool / ERC-20 selectors (public ABI). */
export const SELECTORS = {
  supply: '0x617b54fe',
  withdraw: '0x69328dec',
  borrow: '0xa415bcad',
  repay: '0x573ade81',
  approve: '0x095ea7b3',
} as const;

export const SIGNATURES = {
  supply: 'supply(address,uint256,address,uint16)',
  withdraw: 'withdraw(address,uint256,address)',
  borrow: 'borrow(address,uint256,uint256,uint16,address)',
  repay: 'repay(address,uint256,uint256,address)',
  approve: 'approve(address,uint256)',
} as const;

export const DEFAULT_NETWORK = 'ethereum';
export const VARIABLE_RATE_MODE = 2;
export const REFERRAL_CODE = 0;
