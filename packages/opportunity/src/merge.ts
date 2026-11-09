import { parseMarketSnapshot, type MarketSnapshotFile } from '@shadow-banking/simulator';
import { roundNumber } from './numbers.js';
import type { ProviderPatch, RefreshMeta, SnapshotAsset, SnapshotMarket } from './types.js';

function cloneRecord(v: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assetKey(a: { symbol: string; network?: string }): string {
  return `${a.symbol.toLowerCase()}::${(a.network ?? '').toLowerCase()}`;
}

function marketKey(m: { protocol: string; network: string; asset: string }): string {
  return `${m.protocol}::${m.network}::${m.asset}`.toLowerCase();
}

function overlayAsset(base: SnapshotAsset, patch: SnapshotAsset): SnapshotAsset {
  const next: SnapshotAsset = { ...base };
  if (patch.priceUsd !== undefined) next.priceUsd = patch.priceUsd;
  if (patch.yieldApy !== undefined) next.yieldApy = patch.yieldApy;
  if (patch.source) next.source = patch.source;
  if (patch.asOf) next.asOf = patch.asOf;
  if (patch.notes) next.notes = patch.notes;
  if (patch.network) next.network = patch.network;
  return next;
}

function overlayMarket(base: SnapshotMarket, patch: SnapshotMarket): SnapshotMarket {
  return { ...base, ...patch };
}

function mergeHyperliquid(
  base: unknown,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!patch) return isRecord(base) ? base : undefined;
  const out = isRecord(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'funding' && isRecord(v) && isRecord(out['funding'])) {
      const funding = { ...out['funding'] };
      for (const [coin, row] of Object.entries(v)) {
        const prev = isRecord(funding[coin]) ? funding[coin] : {};
        funding[coin] = isRecord(row) ? { ...prev, ...row } : row;
      }
      out['funding'] = funding;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function mergeGas(
  base: unknown,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!patch) return isRecord(base) ? base : undefined;
  const out = isRecord(base) ? { ...base } : {};
  for (const [network, row] of Object.entries(patch)) {
    if (!isRecord(row)) continue;
    const prev = isRecord(out[network]) ? { ...out[network] } : {};
    const prevGwei = isRecord(prev['gasPriceGwei']) ? { ...prev['gasPriceGwei'] } : {};
    const nextGwei = isRecord(row['gasPriceGwei']) ? row['gasPriceGwei'] : undefined;
    prev['gasPriceGwei'] = nextGwei ? { ...prevGwei, ...nextGwei } : prevGwei;
    if (typeof row['source'] === 'string') prev['spotSource'] = row['source'];
    if (typeof row['asOf'] === 'string') prev['spotAsOf'] = row['asOf'];
    if (typeof row['notes'] === 'string') {
      const prevNotes = typeof prev['notes'] === 'string' ? prev['notes'] : '';
      prev['notes'] = `${prevNotes} ${row['notes']}`.trim();
    }
    out[network] = prev;
  }
  return out;
}

function recomputeEthereumGasUsd(costs: Record<string, unknown>, ethPriceUsd: number): void {
  const gas = isRecord(costs['gas']) ? costs['gas'] : undefined;
  if (!gas) return;
  const ethereum = isRecord(gas['ethereum']) ? { ...gas['ethereum'] } : undefined;
  if (!ethereum) return;
  ethereum['ethPriceUsd'] = ethPriceUsd;
  const gwei = isRecord(ethereum['gasPriceGwei']) ? ethereum['gasPriceGwei'] : undefined;
  const planning = typeof gwei?.['planning'] === 'number' ? gwei['planning'] : undefined;
  const spot = typeof gwei?.['spot'] === 'number' ? gwei['spot'] : undefined;
  const actions = isRecord(ethereum['actions']) ? { ...ethereum['actions'] } : undefined;
  if (actions) {
    for (const [name, row] of Object.entries(actions)) {
      if (!isRecord(row) || typeof row['gasUnits'] !== 'number') continue;
      const units = row['gasUnits'];
      const next = { ...row };
      if (planning !== undefined) {
        next['usdAtPlanning'] = roundNumber(units * planning * 1e-9 * ethPriceUsd, 6);
      }
      if (spot !== undefined) {
        next['usdAtSpot'] = roundNumber(units * spot * 1e-9 * ethPriceUsd, 6);
      }
      actions[name] = next;
    }
    ethereum['actions'] = actions;
  }
  gas['ethereum'] = ethereum;
  costs['gas'] = gas;
}

function bestUsdcSupply(markets: SnapshotMarket[]): SnapshotMarket | undefined {
  const usdc = markets.filter((m) => m.asset === 'USDC' && m.supplyApy != null);
  if (usdc.length === 0) return undefined;
  return usdc.reduce((a, b) => ((a.supplyApy ?? 0) >= (b.supplyApy ?? 0) ? a : b));
}

function asAssets(raw: unknown): SnapshotAsset[] {
  if (!Array.isArray(raw)) return [];
  const out: SnapshotAsset[] = [];
  for (const row of raw) {
    if (isRecord(row) && typeof row['symbol'] === 'string') {
      out.push(row as unknown as SnapshotAsset);
    }
  }
  return out;
}

function asMarkets(raw: unknown): SnapshotMarket[] {
  if (!Array.isArray(raw)) return [];
  const out: SnapshotMarket[] = [];
  for (const row of raw) {
    if (
      isRecord(row) &&
      typeof row['protocol'] === 'string' &&
      typeof row['network'] === 'string' &&
      typeof row['asset'] === 'string'
    ) {
      out.push(row as unknown as SnapshotMarket);
    }
  }
  return out;
}

export function applyPatches(
  fixture: MarketSnapshotFile,
  patches: ProviderPatch[],
  meta: RefreshMeta,
): MarketSnapshotFile {
  const snap = cloneRecord(fixture);
  if (meta.mode === 'live') snap['snapshotDate'] = meta.ranAt.slice(0, 10);

  const assets = asAssets(snap['assets']);
  const markets = asMarkets(snap['markets']);

  for (const patch of patches) {
    if (patch.assets) {
      for (const a of patch.assets) {
        const exact = assets.findIndex((x) => assetKey(x) === assetKey(a));
        const bySym = assets.findIndex((x) => x.symbol.toLowerCase() === a.symbol.toLowerCase());
        const idx = exact >= 0 ? exact : bySym;
        if (idx >= 0 && assets[idx]) assets[idx] = overlayAsset(assets[idx], a);
        else assets.push(a);
      }
    }
    if (patch.markets) {
      for (const m of patch.markets) {
        const idx = markets.findIndex((x) => marketKey(x) === marketKey(m));
        if (idx >= 0 && markets[idx]) markets[idx] = overlayMarket(markets[idx], m);
        else markets.push(m);
      }
    }
    if (patch.hyperliquid) {
      const costs = isRecord(snap['costs']) ? { ...snap['costs'] } : {};
      const merged = mergeHyperliquid(costs['hyperliquid'], patch.hyperliquid);
      if (merged) costs['hyperliquid'] = merged;
      snap['costs'] = costs;
    }
    if (patch.gas) {
      const costs = isRecord(snap['costs']) ? { ...snap['costs'] } : {};
      const merged = mergeGas(costs['gas'], patch.gas);
      if (merged) costs['gas'] = merged;
      snap['costs'] = costs;
    }
  }

  const usdcMkt = bestUsdcSupply(markets);
  if (usdcMkt?.supplyApy != null) {
    const idx = assets.findIndex((a) => a.symbol === 'USDC');
    if (idx >= 0 && assets[idx]) {
      const overlay: SnapshotAsset = {
        symbol: 'USDC',
        network: usdcMkt.network,
        yieldApy: usdcMkt.supplyApy,
        notes: `USDC asset yieldApy is the highest captured Aave USDC supply APY (${usdcMkt.network} ${usdcMkt.protocol}). Preserve-liquid option; not invented.`,
      };
      if (usdcMkt.source) overlay.source = usdcMkt.source;
      if (usdcMkt.asOf) overlay.asOf = usdcMkt.asOf;
      assets[idx] = overlayAsset(assets[idx], overlay);
    }
  }

  snap['assets'] = assets;
  snap['markets'] = markets;

  const eth = assets.find((a) => a.symbol === 'ETH' && a.priceUsd != null);
  if (eth?.priceUsd != null && isRecord(snap['costs'])) {
    recomputeEthereumGasUsd(snap['costs'], eth.priceUsd);
  }

  const sources = new Set<string>(
    Array.isArray(snap['sourcesIndex']) ? (snap['sourcesIndex'] as string[]) : [],
  );
  for (const p of patches) {
    if (p.source) sources.add(p.source);
  }
  snap['sourcesIndex'] = [...sources];
  snap['refresh'] = meta;
  snap['quality'] = meta.quality;
  return parseMarketSnapshot(snap);
}
