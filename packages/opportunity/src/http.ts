import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HttpClient, HttpResult } from './types.js';

const UA = 'shadow-banking-opportunity/0.1 (read-only; devennpatnaik/shadow-banking)';

interface CacheEntry {
  key: string;
  url: string;
  fetchedAt: string;
  body: unknown;
}

export interface CachedHttpOptions {
  cacheDir: string;
  ttlMs: number;
  offline: boolean;
  fetchImpl?: typeof fetch;
}

export class CachedHttp implements HttpClient {
  private readonly cacheDir: string;
  private readonly ttlMs: number;
  private readonly offline: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CachedHttpOptions) {
    this.cacheDir = opts.cacheDir;
    this.ttlMs = opts.ttlMs;
    this.offline = opts.offline;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async getJson<T>(url: string, cacheKey: string): Promise<HttpResult<T>> {
    return this.request<T>(url, { method: 'GET' }, cacheKey);
  }

  async postJson<T>(url: string, body: unknown, cacheKey: string): Promise<HttpResult<T>> {
    return this.request<T>(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      cacheKey,
    );
  }

  private cachePath(key: string): string {
    const hash = createHash('sha256').update(key).digest('hex');
    return resolve(this.cacheDir, `${hash}.json`);
  }

  private readCache(key: string): CacheEntry | undefined {
    const path = this.cachePath(key);
    if (!existsSync(path)) return undefined;
    const raw = JSON.parse(readFileSync(path, 'utf8')) as CacheEntry;
    const age = Date.now() - Date.parse(raw.fetchedAt);
    if (!Number.isFinite(age)) return undefined;
    if (this.offline) return raw;
    if (age > this.ttlMs) return undefined;
    return raw;
  }

  private writeCache(entry: CacheEntry): void {
    mkdirSync(this.cacheDir, { recursive: true });
    writeFileSync(this.cachePath(entry.key), `${JSON.stringify(entry, null, 2)}\n`);
  }

  private async request<T>(
    url: string,
    init: RequestInit,
    cacheKey: string,
  ): Promise<HttpResult<T>> {
    const cached = this.readCache(cacheKey);
    if (cached) {
      return {
        data: cached.body as T,
        asOf: cached.fetchedAt,
        source: url,
        fromCache: true,
      };
    }
    if (this.offline) {
      throw new Error(`offline: cache miss for ${cacheKey} (${url})`);
    }
    const res = await this.fetchImpl(url, {
      ...init,
      headers: { 'user-agent': UA, ...(init.headers ?? {}) },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${url}: ${text.slice(0, 240)}`);
    }
    const data = JSON.parse(text) as T;
    const asOf = new Date().toISOString();
    this.writeCache({ key: cacheKey, url, fetchedAt: asOf, body: data });
    return { data, asOf, source: url, fromCache: false };
  }
}
