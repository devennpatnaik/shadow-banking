import { PHASE6_BROADCAST_ENV } from './envelope.js';

export class BroadcastRefused extends Error {
  readonly code = 'BROADCAST_REFUSED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'BroadcastRefused';
  }
}

/**
 * Phase 5 never broadcasts. Even with the future Phase 6 env flag set, this build refuses.
 */
export function refuseBroadcast(env: NodeJS.ProcessEnv = process.env): never {
  const flagOn = env[PHASE6_BROADCAST_ENV] === '1';
  if (!flagOn) {
    throw new BroadcastRefused(
      `broadcast is forbidden in Phase 5 (propose+approve only). ${PHASE6_BROADCAST_ENV} is off. Live transactions require a future Phase 6 flag, default off.`,
    );
  }
  throw new BroadcastRefused(
    `broadcast is still forbidden: this is Phase 5 assisted execution. ${PHASE6_BROADCAST_ENV}=1 is reserved for unimplemented Phase 6 limited automation. No signing keys, no eth_sendRawTransaction.`,
  );
}
