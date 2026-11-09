import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BalanceSheet, DisclosureProfile } from '@shadow-banking/core';
import { defaultDisclosure, defaultPaperBook } from './defaults.js';
import {
  hydrateBalanceSheet,
  hydrateGovernorSnapshot,
  loadDisclosureFile,
  looksLikeBalanceSheet,
  readJsonFile,
  type GovernorSnapshot,
} from './hydrate.js';
import { snapshotFromBook } from '@shadow-banking/risk';

export function repoRootFromCwd(): string {
  return process.cwd();
}

export function defaultMarketSnapshotPath(): string | null {
  const p = resolve(repoRootFromCwd(), 'docs/data/market-snapshot-2026-10-21.json');
  return existsSync(p) ? p : null;
}

export function loadBook(path: string | undefined): { book: BalanceSheet; source: string } {
  if (!path) return { book: defaultPaperBook(), source: 'builtin-paper-book' };
  const raw = readJsonFile(path);
  return { book: hydrateBalanceSheet(raw), source: path };
}

export function loadProfile(path: string | undefined): {
  profile: DisclosureProfile;
  source: string;
} {
  if (!path) return { profile: defaultDisclosure(), source: 'builtin-paper-disclosure' };
  return { profile: loadDisclosureFile(path), source: path };
}

export function loadRiskInput(
  bookPath: string | undefined,
  snapshotPath: string | undefined,
  disclosurePath: string | undefined,
): { snapshot: GovernorSnapshot; source: string; book?: BalanceSheet; profile: DisclosureProfile } {
  const { profile, source: disclosureSource } = loadProfile(disclosurePath);
  if (snapshotPath) {
    const raw = readJsonFile(snapshotPath);
    if (looksLikeBalanceSheet(raw)) {
      const book = hydrateBalanceSheet(raw);
      return {
        snapshot: snapshotFromBook(book, profile),
        source: snapshotPath,
        book,
        profile,
      };
    }
    return { snapshot: hydrateGovernorSnapshot(raw), source: snapshotPath, profile };
  }
  const { book, source } = loadBook(bookPath);
  return {
    snapshot: snapshotFromBook(book, profile),
    source: `${source} + ${disclosureSource}`,
    book,
    profile,
  };
}
