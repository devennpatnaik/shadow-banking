import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function repoRootFrom(start = process.cwd()): string {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'docs/data')) && existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const fromPkg = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  return fromPkg;
}

export function defaultFixturePath(root = repoRootFrom()): string {
  return resolve(root, 'docs/data/market-snapshot-2026-10-21.json');
}

export function defaultCacheDir(root = repoRootFrom()): string {
  return resolve(root, '.cache/opportunity');
}

export function datedOutPath(date: Date, root = repoRootFrom()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return resolve(root, `docs/data/market-snapshot-${y}-${m}-${d}.json`);
}

export function latestSnapshotPath(root = repoRootFrom()): string | null {
  const dir = resolve(root, 'docs/data');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => /^market-snapshot-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  const last = files[files.length - 1];
  return last ? resolve(dir, last) : null;
}
