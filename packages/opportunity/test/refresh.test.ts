import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMarketSnapshot } from '@shadow-banking/simulator';
import { applyPatches } from '../src/merge.js';
import { defaultFixturePath } from '../src/paths.js';
import { fetchAavePatch } from '../src/providers/aave.js';
import { fixturePatch } from '../src/providers/fixture.js';
import { fetchHyperliquidPatch } from '../src/providers/hyperliquid.js';
import { refreshSnapshot } from '../src/refresh.js';
import { main } from '../src/run.js';
import type { HttpClient, HttpResult, RefreshMeta } from '../src/types.js';

const FIXTURE = defaultFixturePath();

function meta(partial: Partial<RefreshMeta> = {}): RefreshMeta {
  return {
    mode: 'live',
    ranAt: '2026-11-09T12:00:00.000Z',
    providers: ['fixture'],
    quality: { fixture: 'ok' },
    degradations: [],
    cacheDir: '/tmp',
    networkUsed: false,
    ...partial,
  };
}

describe('fixture refresh (no network)', () => {
  it('emits a snapshot the simulator schema accepts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'opp-'));
    const out = join(dir, 'snap.json');
    const result = await refreshSnapshot({
      provider: 'fixture',
      fixturePath: FIXTURE,
      outPath: out,
      cacheDir: join(dir, 'cache'),
      offline: true,
    });
    expect(result.meta.networkUsed).toBe(false);
    expect(result.snapshot.snapshotDate).toBe('2026-10-21');
    expect(result.snapshot.assets.length).toBeGreaterThan(3);
    expect(result.snapshot.markets.some((m) => m.asset === 'wstETH')).toBe(true);
    const roundTrip = parseMarketSnapshot(JSON.parse(readFileSync(out, 'utf8')) as unknown);
    expect(roundTrip.snapshotDate).toBe('2026-10-21');
    expect(roundTrip.hurdle).toBe(0.1);
  });

  it('does not invent zeros when a live field is missing', () => {
    const { snapshot } = fixturePatch(FIXTURE);
    const rETH = snapshot.assets.find((a) => a.symbol === 'rETH');
    expect(rETH?.yieldApy).toBe(0.0189);
    const merged = applyPatches(
      snapshot,
      [
        {
          provider: 'lst',
          asOf: '2026-11-09T00:00:00Z',
          source: 'test',
          quality: 'unavailable',
          degradations: [{ provider: 'lst', reason: 'timeout' }],
        },
      ],
      meta({ degradations: [{ provider: 'lst', reason: 'timeout' }] }),
    );
    const still = merged.assets.find((a) => a.symbol === 'rETH');
    expect(still?.yieldApy).toBe(0.0189);
    expect(still?.asOf).toBe(rETH?.asOf);
  });
});

describe('recorded HTTP providers', () => {
  it('maps Aave GraphQL reserves to snapshot markets with source+asOf', async () => {
    const body = JSON.parse(
      readFileSync(new URL('./fixtures/aave-graphql.json', import.meta.url), 'utf8'),
    ) as unknown;
    const http: HttpClient = {
      getJson: () => Promise.reject(new Error('no GET')),
      postJson: <T>(): Promise<HttpResult<T>> =>
        Promise.resolve({
          data: body as T,
          asOf: '2026-11-09T12:00:00.000Z',
          source: 'https://api.v3.aave.com/graphql',
          fromCache: true,
        }),
    };
    const patch = await fetchAavePatch(http);
    expect(patch.quality).toBe('ok');
    const wst = patch.markets?.find((m) => m.asset === 'wstETH' && m.network === 'ethereum');
    expect(wst?.ltv).toBe(0.79);
    expect(wst?.eMode?.ltv).toBe(0.93);
    expect(wst?.eMode?.borrowable).toBe(false);
    expect(wst?.source).toContain('aave.com/graphql');
    expect(wst?.asOf).toBe('2026-11-09T12:00:00.000Z');
    const eth = patch.assets?.find((a) => a.symbol === 'ETH');
    expect(eth?.priceUsd).toBe(2140.01);
    expect(eth?.yieldApy).toBe(0);
  });

  it('Hyperliquid unavailable degrades without inventing funding', async () => {
    const http: HttpClient = {
      getJson: () => Promise.reject(new Error('no GET')),
      postJson: () => Promise.reject(new Error('HTTP 429')),
    };
    const patch = await fetchHyperliquidPatch(http);
    expect(patch.quality).toBe('unavailable');
    expect(patch.hyperliquid).toBeUndefined();
    expect(patch.degradations[0]?.reason).toMatch(/429/);
  });
});

describe('CLI', () => {
  it('help --json', async () => {
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      const code = await main(['node', 'opportunity', 'help', '--json']);
      expect(code).toBe(0);
    } finally {
      process.stdout.write = orig;
    }
  });

  it('refresh --provider fixture --json writes a consumable file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'opp-cli-'));
    const out = join(dir, 'market-snapshot-2099-01-01.json');
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    let code: number;
    try {
      code = await main([
        'node',
        'opportunity',
        'refresh',
        '--provider',
        'fixture',
        '--fixture',
        FIXTURE,
        '--out',
        out,
        '--json',
      ]);
    } finally {
      process.stdout.write = orig;
    }
    expect(code).toBe(0);
    const written = parseMarketSnapshot(JSON.parse(readFileSync(out, 'utf8')) as unknown);
    expect(written.markets.length).toBeGreaterThan(0);
    writeFileSync(join(dir, 'ok'), '1');
  });
});
