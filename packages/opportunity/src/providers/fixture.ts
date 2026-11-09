import { readFileSync } from 'node:fs';
import { parseMarketSnapshot, type MarketSnapshotFile } from '@shadow-banking/simulator';
import type { ProviderPatch } from '../types.js';

export function loadFixtureSnapshot(path: string): MarketSnapshotFile {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return parseMarketSnapshot(raw);
}

/** Static provider: returns the recorded snapshot unchanged. No network. */
export function fixturePatch(path: string): { snapshot: MarketSnapshotFile; patch: ProviderPatch } {
  const snapshot = loadFixtureSnapshot(path);
  return {
    snapshot,
    patch: {
      provider: 'fixture',
      asOf: snapshot.snapshotDate,
      source: path,
      quality: 'ok',
      degradations: [],
    },
  };
}
