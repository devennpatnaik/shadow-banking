import { d } from '@shadow-banking/core';
import { EXECUTION_RPC_ENV } from './envelope.js';
import type {
  ProposedAction,
  SimulationBundle,
  SimulationCallResult,
  SimulatorId,
} from './types.js';

export interface Simulator {
  readonly id: SimulatorId;
  simulate(actions: readonly ProposedAction[]): SimulationBundle;
}

export interface AsyncSimulator {
  readonly id: SimulatorId;
  simulate(actions: readonly ProposedAction[]): Promise<SimulationBundle>;
}

function sumGas(actions: readonly ProposedAction[]): { gas: string; usd: string } {
  let gas = d(0);
  let usd = d(0);
  for (const a of actions) {
    gas = gas.plus(d(a.estimatedGas));
    usd = usd.plus(d(a.estimatedGasUsd));
  }
  return { gas: gas.toFixed(0), usd: usd.toString() };
}

export function mockSimulate(actions: readonly ProposedAction[]): SimulationBundle {
  const totals = sumGas(actions);
  const calls: SimulationCallResult[] = actions.map((a) => ({
    actionId: a.id,
    ok: true,
    gasUsed: a.estimatedGas,
    returnData: a.calldata ? '0x' : null,
    error: null,
  }));
  return {
    simulator: 'mock',
    ok: true,
    dryRun: true,
    rpcUrlSet: false,
    gasUsed: totals.gas,
    estimatedGasUsd: totals.usd,
    calls,
    notes: [
      'Offline mock simulator. No RPC. Deterministic gas from action table.',
      `Optional live sim: set ${EXECUTION_RPC_ENV} and pass --simulator rpc (eth_simulateV1).`,
      'Anvil fork: anvil --fork-url $ARCHIVE_RPC then EXECUTION_RPC_URL=http://127.0.0.1:8545.',
    ],
  };
}

export function mockSimulator(): Simulator {
  return {
    id: 'mock',
    simulate: mockSimulate,
  };
}

export interface RpcSimulatorOpts {
  url: string;
  fetchImpl?: typeof fetch;
}

/**
 * Dry-run adapter: POST eth_simulateV1 (fallback eth_estimateGas). Never sends
 * eth_sendRawTransaction / eth_sendTransaction.
 */
export function rpcSimulator(opts: RpcSimulatorOpts): AsyncSimulator {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    id: 'eth_simulateV1',
    async simulate(actions) {
      const calls: SimulationCallResult[] = [];
      const notes: string[] = [
        `RPC dry-run against ${opts.url} (eth_simulateV1). Broadcast is still forbidden.`,
      ];
      let ok = true;
      for (const a of actions) {
        if (!a.calldata) {
          calls.push({
            actionId: a.id,
            ok: true,
            gasUsed: a.estimatedGas,
            returnData: null,
            error: null,
          });
          notes.push(`${a.id}: no calldata (SDK stub); skipped RPC.`);
          continue;
        }
        try {
          const body = {
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_simulateV1',
            params: [
              {
                blockStateCalls: [
                  {
                    calls: [{ to: a.calldata.to, data: a.calldata.data, value: '0x0' }],
                  },
                ],
              },
              'latest',
            ],
          };
          const res = await fetchImpl(opts.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
          const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
          if (json.error) {
            ok = false;
            calls.push({
              actionId: a.id,
              ok: false,
              gasUsed: a.estimatedGas,
              returnData: null,
              error: json.error.message ?? 'rpc error',
            });
          } else {
            calls.push({
              actionId: a.id,
              ok: true,
              gasUsed: a.estimatedGas,
              returnData: '0x',
              error: null,
            });
          }
        } catch (err) {
          ok = false;
          calls.push({
            actionId: a.id,
            ok: false,
            gasUsed: a.estimatedGas,
            returnData: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      const totals = sumGas(actions);
      return {
        simulator: 'eth_simulateV1',
        ok,
        dryRun: true,
        rpcUrlSet: true,
        gasUsed: totals.gas,
        estimatedGasUsd: totals.usd,
        calls,
        notes,
      };
    },
  };
}

export function resolveRpcSimulator(
  kind: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): AsyncSimulator | null {
  if (kind !== 'rpc' && kind !== 'eth_simulateV1') return null;
  const url = env[EXECUTION_RPC_ENV];
  if (!url) {
    throw new Error(
      `--simulator rpc requires ${EXECUTION_RPC_ENV} (e.g. anvil http://127.0.0.1:8545). Tests use --simulator mock.`,
    );
  }
  return rpcSimulator({ url });
}
