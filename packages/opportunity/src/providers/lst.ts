import { percentPointsToDecimal, requireFinite, roundNumber } from '../numbers.js';
import {
  DEFAULT_CBETH,
  DEFAULT_JITO_STATS,
  DEFAULT_LIDO_SMA,
  DEFAULT_ROCKETPOOL_APR,
  type Degradation,
  type HttpClient,
  type ProviderPatch,
  type SnapshotAsset,
} from '../types.js';

interface LidoSma {
  data?: { smaApr?: number; aprs?: { timeUnix: number; apr: number }[] };
}

interface RocketApr {
  yearlyAPR?: string;
}

interface Cbeth {
  apy?: string;
  conversion_rate?: string;
}

interface JitoStats {
  apy?: { data: number; date: string }[];
}

async function one(
  label: string,
  run: () => Promise<{ asset: SnapshotAsset }>,
): Promise<{ asset?: SnapshotAsset; degradation?: Degradation }> {
  try {
    const { asset } = await run();
    return { asset };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { degradation: { provider: 'lst', reason: `${label}: ${reason}` } };
  }
}

export async function fetchLstPatch(http: HttpClient): Promise<ProviderPatch> {
  const assets: SnapshotAsset[] = [];
  const degradations: Degradation[] = [];

  const lido = await one('lido', async () => {
    const res = await http.getJson<LidoSma>(DEFAULT_LIDO_SMA, 'lst:lido:sma');
    const sma = requireFinite(res.data.data?.smaApr, 'lido smaApr');
    const apy = percentPointsToDecimal(sma);
    const asset: SnapshotAsset = {
      symbol: 'stETH',
      network: 'ethereum',
      yieldApy: apy,
      source: DEFAULT_LIDO_SMA,
      asOf: res.asOf,
      notes: `Lido 7-day SMA APR ${sma}% published as percent points; stored as decimal ${apy}. wstETH uses the same yield (non-rebasing wrapper).`,
    };
    assets.push(asset);
    assets.push({
      symbol: 'wstETH',
      network: 'ethereum',
      yieldApy: apy,
      source: `${DEFAULT_LIDO_SMA} (wstETH accrues via stETH exchange rate)`,
      asOf: res.asOf,
      notes:
        'Yield copied from stETH SMA; price comes from the Aave oracle overlay when live Aave data is present.',
    });
    return { asset };
  });
  if (lido.degradation) degradations.push(lido.degradation);

  const reth = await one('rocketpool', async () => {
    const res = await http.getJson<RocketApr>(DEFAULT_ROCKETPOOL_APR, 'lst:rocketpool:apr');
    const points = requireFinite(res.data.yearlyAPR, 'rocketpool yearlyAPR');
    const apy = percentPointsToDecimal(points);
    const asset: SnapshotAsset = {
      symbol: 'rETH',
      network: 'ethereum',
      yieldApy: apy,
      source: DEFAULT_ROCKETPOOL_APR,
      asOf: res.asOf,
      notes: `Rocket Pool yearlyAPR ${points}% (percent points) → decimal ${apy}.`,
    };
    assets.push(asset);
    return { asset };
  });
  if (reth.degradation) degradations.push(reth.degradation);

  const cbeth = await one('cbETH', async () => {
    const res = await http.getJson<Cbeth>(DEFAULT_CBETH, 'lst:cbeth');
    const apy = roundNumber(requireFinite(res.data.apy, 'cbETH apy'), 8);
    const asset: SnapshotAsset = {
      symbol: 'cbETH',
      network: 'base',
      yieldApy: apy,
      source: DEFAULT_CBETH,
      asOf: res.asOf,
      notes: `Coinbase wrapped-assets API apy field is already a decimal. conversion_rate=${res.data.conversion_rate ?? 'n/a'}.`,
    };
    assets.push(asset);
    return { asset };
  });
  if (cbeth.degradation) degradations.push(cbeth.degradation);

  const jito = await one('jitoSOL', async () => {
    const res = await http.getJson<JitoStats>(DEFAULT_JITO_STATS, 'lst:jito:stats');
    const series = res.data.apy ?? [];
    const last = series[series.length - 1];
    if (!last) throw new Error('jito stake_pool_stats apy series empty');
    const apy = roundNumber(requireFinite(last.data, 'jito apy'), 8);
    const asset: SnapshotAsset = {
      symbol: 'jitoSOL',
      network: 'solana',
      yieldApy: apy,
      source: DEFAULT_JITO_STATS,
      asOf: last.date ?? res.asOf,
      notes: `Jito stake-pool APY series last point (${last.date}). Optional second ecosystem; not an Aave reserve.`,
    };
    assets.push(asset);
    return { asset };
  });
  if (jito.degradation) degradations.push(jito.degradation);

  const quality = assets.length === 0 ? 'unavailable' : degradations.length > 0 ? 'degraded' : 'ok';
  return {
    provider: 'lst',
    asOf: new Date().toISOString(),
    source: 'lido + rocketpool + coinbase wrapped-assets + jito stake_pool_stats',
    assets,
    quality,
    degradations,
  };
}
