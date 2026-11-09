export const PHASE5_ENVELOPE = {
  paper: true as const,
  execution: 'propose_only' as const,
  phase: '5' as const,
  signingKeys: false as const,
  liveTransactions: false as const,
  broadcast: false as const,
};

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_VETO = 2;

/** Future Phase 6 limited-automation flag. Off by default. Never enables Phase 5 broadcast. */
export const PHASE6_BROADCAST_ENV = 'SHADOW_BANKING_PHASE6_BROADCAST';

/** Optional JSON-RPC for eth_simulateV1 / eth_estimateGas. Tests use the mock simulator. */
export const EXECUTION_RPC_ENV = 'EXECUTION_RPC_URL';
