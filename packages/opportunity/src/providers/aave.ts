import { parseFinite, requireFinite, roundNumber } from '../numbers.js';
import {
  DEFAULT_AAVE_GRAPHQL,
  type HttpClient,
  type ProviderPatch,
  type SnapshotAsset,
  type SnapshotEMode,
  type SnapshotMarket,
} from '../types.js';

const MARKETS_QUERY = `query OpportunityMarkets($chainIds: [ChainId!]!) {
  markets(request: { chainIds: $chainIds }) {
    name
    chain { chainId name }
    reserves {
      underlyingToken { symbol address }
      usdExchangeRate
      supplyInfo {
        apy { value }
        maxLTV { value }
        liquidationThreshold { value }
        liquidationBonus { value }
        canBeCollateral
      }
      borrowInfo {
        apy { value }
        borrowingState
        utilizationRate { value }
      }
      eModeInfo {
        categoryId
        label
        maxLTV { value }
        liquidationThreshold { value }
        liquidationPenalty { value }
        canBeCollateral
        canBeBorrowed
      }
    }
  }
}`;

const WANTED_ASSETS = new Set(['WETH', 'wstETH', 'USDC', 'cbETH', 'rETH']);
const WANTED_MARKETS = new Set(['AaveV3Ethereum', 'AaveV3Arbitrum', 'AaveV3Base']);

interface Percent {
  value: string;
}

interface GqlEMode {
  categoryId: number;
  label: string;
  maxLTV: Percent;
  liquidationThreshold: Percent;
  liquidationPenalty: Percent;
  canBeCollateral: boolean;
  canBeBorrowed: boolean;
}

interface GqlReserve {
  underlyingToken: { symbol: string; address: string };
  usdExchangeRate: string;
  supplyInfo: {
    apy: Percent;
    maxLTV: Percent;
    liquidationThreshold: Percent;
    liquidationBonus: Percent;
    canBeCollateral: boolean;
  };
  borrowInfo: {
    apy: Percent;
    borrowingState: string;
    utilizationRate: Percent;
  } | null;
  eModeInfo: GqlEMode[];
}

interface GqlMarket {
  name: string;
  chain: { chainId: number; name: string };
  reserves: GqlReserve[];
}

interface GqlResponse {
  data?: { markets: GqlMarket[] };
  errors?: { message: string }[];
}

function pct(raw: Percent | undefined, label: string): number {
  return roundNumber(requireFinite(raw?.value, label), 8);
}

function chainNetwork(chainId: number): string | undefined {
  if (chainId === 1) return 'ethereum';
  if (chainId === 42161) return 'arbitrum';
  if (chainId === 8453) return 'base';
  return undefined;
}

function protocolOf(name: string): string {
  return name === 'AaveV3Ethereum' ? 'aave-v3-core' : 'aave-v3';
}

function toEMode(e: GqlEMode): SnapshotEMode {
  return {
    category: `${e.label} (id ${e.categoryId})`,
    ltv: pct(e.maxLTV, `eMode ${e.label} ltv`),
    liquidationThreshold: pct(e.liquidationThreshold, `eMode ${e.label} lt`),
    liquidationBonus: pct(e.liquidationPenalty, `eMode ${e.label} bonus`),
    collateral: e.canBeCollateral,
    borrowable: e.canBeBorrowed,
  };
}

function pickEMode(network: string, asset: string, infos: GqlEMode[]): SnapshotEMode | null {
  if (asset === 'USDC') return null;
  const find = (pred: (e: GqlEMode) => boolean): GqlEMode | undefined => infos.find(pred);
  if (network === 'arbitrum' && asset === 'wstETH') {
    const hits = infos.filter((x) => /wstETH\/WETH/i.test(x.label));
    const e = hits.find((x) => /^wstETH\/WETH/i.test(x.label)) ?? hits[0];
    if (e) return toEMode(e);
  }
  if (network === 'base' && asset === 'wstETH') {
    const hits = infos.filter((x) => /wstETH\/WETH/i.test(x.label));
    const e = hits.find((x) => /^wstETH\/WETH/i.test(x.label)) ?? hits[0];
    if (e) return toEMode(e);
  }
  if (network === 'base' && asset === 'cbETH') {
    const e = find((x) => /cbETH\/WETH/i.test(x.label));
    if (e) return toEMode(e);
  }
  if (network === 'base' && asset === 'WETH') {
    const e = find((x) => x.canBeBorrowed && /cbETH\/WETH/i.test(x.label));
    if (e) return toEMode(e);
  }
  const eth = find((x) => /^ETH correlated$/i.test(x.label));
  if (eth) return toEMode(eth);
  return null;
}

function pickUsdc(reserves: GqlReserve[]): GqlReserve | undefined {
  const usdc = reserves.filter((r) => r.underlyingToken.symbol === 'USDC');
  const enabled = usdc.find((r) => r.borrowInfo?.borrowingState === 'ENABLED');
  return enabled ?? usdc[0];
}

export async function fetchAavePatch(
  http: HttpClient,
  graphqlUrl = DEFAULT_AAVE_GRAPHQL,
): Promise<ProviderPatch> {
  const res = await http.postJson<GqlResponse>(
    graphqlUrl,
    { query: MARKETS_QUERY, variables: { chainIds: [1, 42161, 8453] } },
    'aave:markets:1,42161,8453',
  );
  if (res.data.errors?.length) {
    const msg = res.data.errors.map((e) => e.message).join('; ');
    return {
      provider: 'aave',
      asOf: res.asOf,
      source: graphqlUrl,
      quality: 'unavailable',
      degradations: [{ provider: 'aave', reason: msg }],
    };
  }
  const marketsIn = res.data.data?.markets;
  if (!marketsIn) {
    return {
      provider: 'aave',
      asOf: res.asOf,
      source: graphqlUrl,
      quality: 'unavailable',
      degradations: [{ provider: 'aave', reason: 'GraphQL response missing data.markets' }],
    };
  }

  const assets: SnapshotAsset[] = [];
  const markets: SnapshotMarket[] = [];
  const seenAsset = new Set<string>();

  for (const m of marketsIn) {
    if (!WANTED_MARKETS.has(m.name)) continue;
    const network = chainNetwork(m.chain.chainId);
    if (!network) continue;
    const protocol = protocolOf(m.name);
    const used = new Set<string>();
    for (const symbol of WANTED_ASSETS) {
      const row =
        symbol === 'USDC'
          ? pickUsdc(m.reserves)
          : m.reserves.find((r) => r.underlyingToken.symbol === symbol);
      if (!row) continue;
      if (used.has(symbol)) continue;
      used.add(symbol);
      const supply = roundNumber(requireFinite(row.supplyInfo.apy.value, `${symbol} supplyApy`), 8);
      const borrowRaw = row.borrowInfo?.apy.value;
      const borrow =
        borrowRaw !== undefined
          ? roundNumber(requireFinite(borrowRaw, `${symbol} borrowApy`), 8)
          : null;
      const ltv = roundNumber(requireFinite(row.supplyInfo.maxLTV.value, `${symbol} ltv`), 8);
      const lt = roundNumber(
        requireFinite(row.supplyInfo.liquidationThreshold.value, `${symbol} lt`),
        8,
      );
      const bonus = roundNumber(
        requireFinite(row.supplyInfo.liquidationBonus.value, `${symbol} bonus`),
        8,
      );
      const eMode = pickEMode(network, symbol, row.eModeInfo);
      const util = parseFinite(row.borrowInfo?.utilizationRate.value);
      const notes = [
        `Aave GraphQL market ${m.name}.`,
        row.borrowInfo
          ? `Borrowing ${row.borrowInfo.borrowingState}; utilization ${util !== undefined ? roundNumber(util, 6) : 'n/a'}.`
          : 'No borrowInfo.',
        `Underlying ${row.underlyingToken.address}.`,
        'Supply APY excludes LST staking yield.',
      ].join(' ');
      markets.push({
        protocol,
        network,
        asset: symbol,
        supplyApy: supply,
        borrowApy: borrow,
        ltv,
        liquidationThreshold: lt,
        liquidationBonus: bonus,
        eMode,
        source: graphqlUrl,
        asOf: res.asOf,
        notes,
      });

      const price = roundNumber(requireFinite(row.usdExchangeRate, `${symbol} usdExchangeRate`), 6);
      const assetKey = `${symbol}:${network}`;
      if (!seenAsset.has(assetKey)) {
        seenAsset.add(assetKey);
        assets.push({
          symbol,
          network,
          priceUsd: price,
          source: `${graphqlUrl} (usdExchangeRate / Aave oracle)`,
          asOf: res.asOf,
          notes: `Oracle USD price from ${m.name}. Yield is not an Aave supply APY for LSTs.`,
        });
      }
      if (symbol === 'WETH' && network === 'ethereum' && !seenAsset.has('ETH:ethereum')) {
        seenAsset.add('ETH:ethereum');
        assets.push({
          symbol: 'ETH',
          network: 'ethereum',
          priceUsd: price,
          yieldApy: 0,
          source: `${graphqlUrl} (WETH usdExchangeRate on AaveV3Ethereum)`,
          asOf: res.asOf,
          notes: 'Unstaked ETH earns nothing. Priced from the Aave WETH oracle, not a CEX ticker.',
        });
      }
    }
  }

  if (markets.length === 0) {
    return {
      provider: 'aave',
      asOf: res.asOf,
      source: graphqlUrl,
      quality: 'unavailable',
      degradations: [
        { provider: 'aave', reason: 'no matching Aave v3 Core/Arbitrum/Base reserves' },
      ],
    };
  }

  return {
    provider: 'aave',
    asOf: res.asOf,
    source: graphqlUrl,
    assets,
    markets,
    quality: 'ok',
    degradations: [],
  };
}
