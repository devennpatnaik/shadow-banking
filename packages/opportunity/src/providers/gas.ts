import { parseFinite, roundNumber } from '../numbers.js';
import type { HttpClient, ProviderPatch } from '../types.js';

interface RpcResponse {
  result?: string;
  error?: { message?: string };
}

async function gasPriceGwei(http: HttpClient, url: string, cacheKey: string): Promise<number> {
  const res = await http.postJson<RpcResponse>(
    url,
    { jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] },
    cacheKey,
  );
  if (res.data.error?.message) throw new Error(res.data.error.message);
  const hex = res.data.result;
  const wei = parseFinite(
    hex !== undefined && hex.startsWith('0x') ? Number.parseInt(hex, 16) : hex,
  );
  if (wei === undefined) throw new Error(`eth_gasPrice not numeric: ${String(hex)}`);
  return roundNumber(wei / 1e9, 6);
}

/**
 * Optional live gas. No RPC URL → skip (fixture gas stays). Never fabricates
 * 24h/7d/30d averages; those remain fixture-labelled when present.
 */
export async function fetchGasPatch(
  http: HttpClient,
  env: NodeJS.ProcessEnv,
): Promise<ProviderPatch> {
  const ethereum = env['ETHEREUM_RPC_URL'];
  const arbitrum = env['ARBITRUM_RPC_URL'];
  const base = env['BASE_RPC_URL'];
  if (!ethereum && !arbitrum && !base) {
    return {
      provider: 'gas',
      asOf: new Date().toISOString(),
      source: 'skipped (no ETHEREUM_RPC_URL / ARBITRUM_RPC_URL / BASE_RPC_URL)',
      quality: 'fixture',
      degradations: [
        {
          provider: 'gas',
          reason: 'No RPC URL set; kept fixture gas (spot/planning/history). Not invented.',
        },
      ],
    };
  }

  const gas: Record<string, unknown> = {};
  const degradations: ProviderPatch['degradations'] = [];
  const tryNet = async (network: string, url: string | undefined, key: string) => {
    if (!url) return;
    try {
      const spot = await gasPriceGwei(http, url, key);
      gas[network] = {
        gasPriceGwei: { spot },
        source: `${url} eth_gasPrice`,
        asOf: new Date().toISOString(),
        notes: 'Live spot only. planning/averages remain the fixture overlay when present.',
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      degradations.push({ provider: 'gas', reason: `${network}: ${reason}` });
    }
  };

  await tryNet('ethereum', ethereum, 'rpc:eth:gasPrice');
  await tryNet('arbitrum', arbitrum, 'rpc:arb:gasPrice');
  await tryNet('base', base, 'rpc:base:gasPrice');

  const quality =
    Object.keys(gas).length === 0 ? 'unavailable' : degradations.length ? 'degraded' : 'ok';
  return {
    provider: 'gas',
    asOf: new Date().toISOString(),
    source: 'optional JSON-RPC eth_gasPrice',
    gas,
    quality,
    degradations,
  };
}
