import { readFileSync } from 'node:fs';
import { parseMarketSnapshot, type MarketSnapshotFile } from '@shadow-banking/simulator';
import { defaultFixturePath, latestSnapshotPath, repoRootFrom } from './paths.js';

export function loadSnapshotFile(path: string): MarketSnapshotFile {
  return parseMarketSnapshot(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}

export function resolveShowPath(explicit?: string): string {
  if (explicit) return explicit;
  const root = repoRootFrom();
  return latestSnapshotPath(root) ?? defaultFixturePath(root);
}

export function formatShow(path: string, snap: MarketSnapshotFile): string {
  const refresh = (snap as { refresh?: { mode?: string; degradations?: { reason: string }[] } })
    .refresh;
  const lines = [
    `Market snapshot ${snap.snapshotDate}  ${path}`,
    `schemaVersion ${String(snap.schemaVersion ?? 1)}  currency ${snap.currency ?? 'USD'}  hurdle ${String(snap.hurdle ?? '')}`,
    refresh?.mode ? `refresh mode ${refresh.mode}` : 'refresh mode (none recorded)',
    '',
    'Assets:',
    ...snap.assets.map((a) => {
      const px = a.priceUsd == null ? 'n/a' : String(a.priceUsd);
      const y = a.yieldApy == null ? 'n/a' : String(a.yieldApy);
      return `  ${a.symbol.padEnd(8)} ${(a.network ?? '').padEnd(10)} px=${px.padEnd(12)} yield=${y.padEnd(12)} asOf=${a.asOf ?? 'n/a'}`;
    }),
    '',
    'Markets:',
    ...snap.markets.map((m) => {
      const supply = m.supplyApy == null ? 'n/a' : String(m.supplyApy);
      const borrow = m.borrowApy == null ? 'n/a' : String(m.borrowApy);
      const e = m.eMode ? ` eMode ${m.eMode.category}` : '';
      return `  ${m.protocol} ${m.network} ${m.asset} supply=${supply} borrow=${borrow} asOf=${m.asOf ?? 'n/a'}${e}`;
    }),
  ];
  if (refresh?.degradations?.length) {
    lines.push('', 'Degradations:');
    for (const d of refresh.degradations) lines.push(`  - ${d.reason}`);
  }
  lines.push(
    '',
    'Null means not captured, not zero. Numbers are dated readings, not realized returns.',
  );
  return lines.join('\n');
}
