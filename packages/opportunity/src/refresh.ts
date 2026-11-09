import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseMarketSnapshot } from '@shadow-banking/simulator';
import { CachedHttp } from './http.js';
import { applyPatches } from './merge.js';
import { defaultCacheDir, defaultFixturePath, datedOutPath, repoRootFrom } from './paths.js';
import { fixturePatch } from './providers/fixture.js';
import { fetchAavePatch } from './providers/aave.js';
import { fetchGasPatch } from './providers/gas.js';
import { fetchHyperliquidPatch } from './providers/hyperliquid.js';
import { fetchLstPatch } from './providers/lst.js';
import {
  DEFAULT_AAVE_GRAPHQL,
  DEFAULT_HYPERLIQUID_INFO,
  type Degradation,
  type ProviderPatch,
  type RefreshMeta,
  type RefreshOptions,
  type RefreshResult,
} from './types.js';

function envFlag(env: NodeJS.ProcessEnv, name: string): boolean {
  const v = env[name];
  return v === '1' || v === 'true' || v === 'yes';
}

export function resolveRefreshOptions(
  flags: Record<string, string | undefined>,
  env: NodeJS.ProcessEnv = process.env,
): RefreshOptions {
  const root = repoRootFrom();
  const offline =
    flags['offline'] === '1' || envFlag(env, 'OPPORTUNITY_OFFLINE') || envFlag(env, 'CI');
  const providerRaw = flags['provider'] ?? env['OPPORTUNITY_PROVIDER'];
  const provider: 'fixture' | 'live' =
    providerRaw === 'live' || providerRaw === 'fixture'
      ? providerRaw
      : offline
        ? 'fixture'
        : 'live';
  return {
    provider: flags['offline'] === '1' ? 'fixture' : provider,
    fixturePath: flags['fixture'] ?? env['OPPORTUNITY_FIXTURE'] ?? defaultFixturePath(root),
    ...(flags['out'] ? { outPath: flags['out'] } : {}),
    cacheDir: flags['cache-dir'] ?? env['OPPORTUNITY_CACHE_DIR'] ?? defaultCacheDir(root),
    offline: provider === 'fixture' || offline,
    env,
  };
}

export async function refreshSnapshot(opts: RefreshOptions): Promise<RefreshResult> {
  const now = opts.now ?? new Date();
  const ranAt = now.toISOString();
  const { snapshot: fixture } = fixturePatch(opts.fixturePath);
  const degradations: Degradation[] = [];
  const quality: RefreshMeta['quality'] = { fixture: 'ok' };

  if (opts.provider === 'fixture') {
    const meta: RefreshMeta = {
      mode: 'fixture',
      ranAt,
      providers: ['fixture'],
      quality,
      degradations,
      cacheDir: opts.cacheDir,
      networkUsed: false,
    };
    const tagged = {
      ...(JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>),
      refresh: meta,
      quality,
    };
    const snapshot = parseMarketSnapshot(tagged);
    const parsed = parseMarketSnapshot(snapshot);
    const outPath = opts.outPath;
    if (outPath) {
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, `${JSON.stringify(parsed, null, 2)}\n`);
    }
    return { snapshot: parsed, meta, ...(outPath ? { outPath } : {}) };
  }

  const http =
    opts.http ??
    new CachedHttp({
      cacheDir: opts.cacheDir,
      ttlMs: 15 * 60 * 1000,
      offline: opts.offline,
    });
  const env = opts.env ?? process.env;
  const graphql = env['AAVE_GRAPHQL_URL'] ?? DEFAULT_AAVE_GRAPHQL;
  const hl = env['HYPERLIQUID_INFO_URL'] ?? DEFAULT_HYPERLIQUID_INFO;

  const patches: ProviderPatch[] = [];
  let networkUsed = false;

  const run = async (label: string, fn: () => Promise<ProviderPatch>): Promise<ProviderPatch> => {
    try {
      const p = await fn();
      networkUsed = true;
      return p;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        provider: label as ProviderPatch['provider'],
        asOf: ranAt,
        source: label,
        quality: 'unavailable',
        degradations: [{ provider: label as ProviderPatch['provider'], reason }],
      };
    }
  };

  const aave = await run('aave', () => fetchAavePatch(http, graphql));
  patches.push(aave);
  quality['aave'] = aave.quality;
  degradations.push(...aave.degradations);

  const lst = await run('lst', () => fetchLstPatch(http));
  patches.push(lst);
  quality['lst'] = lst.quality;
  degradations.push(...lst.degradations);

  const hyperliquid = await run('hyperliquid', () => fetchHyperliquidPatch(http, hl));
  patches.push(hyperliquid);
  quality['hyperliquid'] = hyperliquid.quality;
  degradations.push(...hyperliquid.degradations);

  const gas = await run('gas', () => fetchGasPatch(http, env));
  patches.push(gas);
  quality['gas'] = gas.quality;
  degradations.push(...gas.degradations);

  const meta: RefreshMeta = {
    mode: 'live',
    ranAt,
    providers: ['fixture', ...patches.map((p) => p.provider)],
    quality,
    degradations,
    cacheDir: opts.cacheDir,
    networkUsed,
  };
  const snapshot = applyPatches(fixture, patches, meta);
  const parsed = parseMarketSnapshot(snapshot);
  const outPath = opts.outPath ?? datedOutPath(now);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(parsed, null, 2)}\n`);
  return { snapshot: parsed, meta, outPath };
}
