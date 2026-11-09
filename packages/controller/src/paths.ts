import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultFixturePath, repoRootFrom } from '@shadow-banking/opportunity';

export function controllerRepoRoot(start = process.cwd()): string {
  return repoRootFrom(start);
}

export function defaultSnapshotPath(root = controllerRepoRoot()): string {
  return defaultFixturePath(root);
}

export function defaultStateDir(root = controllerRepoRoot()): string {
  return resolve(root, '.cache/paper');
}

export function resolveSnapshotPath(explicit?: string, root = controllerRepoRoot()): string {
  if (explicit) return resolve(explicit);
  const latest = resolve(root, 'docs/data/market-snapshot-2026-10-21.json');
  if (existsSync(latest)) return latest;
  return defaultSnapshotPath(root);
}

export function packageDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}
