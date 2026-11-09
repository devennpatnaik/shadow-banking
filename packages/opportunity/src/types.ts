import type { MarketSnapshotFile } from '@shadow-banking/simulator';

export type ProviderId = 'fixture' | 'aave' | 'lst' | 'hyperliquid' | 'gas';

export type QualityStatus = 'ok' | 'fixture' | 'unavailable' | 'degraded';

export interface Degradation {
  provider: ProviderId;
  reason: string;
}

export interface RefreshMeta {
  mode: 'fixture' | 'live';
  ranAt: string;
  providers: ProviderId[];
  quality: Record<string, QualityStatus | Record<string, QualityStatus>>;
  degradations: Degradation[];
  cacheDir: string;
  networkUsed: boolean;
}

export interface SnapshotAsset {
  symbol: string;
  network?: string;
  priceUsd?: number | null;
  yieldApy?: number | null;
  source?: string;
  asOf?: string;
  notes?: string;
}

export interface SnapshotEMode {
  category: string;
  ltv: number;
  liquidationThreshold: number;
  liquidationBonus: number;
  collateral?: boolean;
  borrowable?: boolean;
}

export interface SnapshotMarket {
  protocol: string;
  network: string;
  asset: string;
  supplyApy?: number | null;
  borrowApy?: number | null;
  ltv?: number | null;
  liquidationThreshold?: number | null;
  liquidationBonus?: number | null;
  eMode?: SnapshotEMode | null;
  source?: string;
  asOf?: string;
  notes?: string;
}

export interface ProviderPatch {
  provider: ProviderId;
  asOf: string;
  source: string;
  assets?: SnapshotAsset[];
  markets?: SnapshotMarket[];
  hyperliquid?: Record<string, unknown>;
  gas?: Record<string, unknown>;
  quality: QualityStatus;
  degradations: Degradation[];
}

export interface HttpResult<T> {
  data: T;
  asOf: string;
  source: string;
  fromCache: boolean;
}

export interface HttpClient {
  getJson<T>(url: string, cacheKey: string): Promise<HttpResult<T>>;
  postJson<T>(url: string, body: unknown, cacheKey: string): Promise<HttpResult<T>>;
}

export interface RefreshOptions {
  provider: 'fixture' | 'live';
  fixturePath: string;
  outPath?: string;
  cacheDir: string;
  offline: boolean;
  now?: Date;
  http?: HttpClient;
  env?: NodeJS.ProcessEnv;
}

export interface RefreshResult {
  snapshot: MarketSnapshotFile;
  meta: RefreshMeta;
  outPath?: string;
}

export const DEFAULT_AAVE_GRAPHQL = 'https://api.v3.aave.com/graphql';
export const DEFAULT_HYPERLIQUID_INFO = 'https://api.hyperliquid.xyz/info';
export const DEFAULT_LIDO_SMA = 'https://eth-api.lido.fi/v1/protocol/steth/apr/sma';
export const DEFAULT_ROCKETPOOL_APR = 'https://api.rocketpool.net/api/apr';
export const DEFAULT_CBETH = 'https://api.exchange.coinbase.com/wrapped-assets/CBETH';
export const DEFAULT_JITO_STATS = 'https://kobe.mainnet.jito.network/api/v1/stake_pool_stats';
