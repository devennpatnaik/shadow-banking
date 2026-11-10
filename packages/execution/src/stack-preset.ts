import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { d } from '@shadow-banking/core';
import type { ActionIntent, Proposal } from '@shadow-banking/risk';
import {
  composeStack,
  loadSnapshot,
  nextStackStepProposal,
  resolveCapital,
  resolveMarket,
  type LegKind,
} from '@shadow-banking/strategy';
import { presetProposal } from './presets.js';

function defaultSnapshotPath(): string | null {
  const p = resolve(process.cwd(), 'docs/data/market-snapshot-2026-10-21.json');
  return existsSync(p) ? p : null;
}

export function stackStepProposal(opts: {
  snapshotPath?: string;
  seed?: string;
  hurdle?: string;
  reserve?: string;
  active?: readonly LegKind[];
}): Proposal {
  const snapshotPath = opts.snapshotPath ?? defaultSnapshotPath();
  if (!snapshotPath) return presetProposal('hold-liquid');
  const snapshot = loadSnapshot(snapshotPath);
  const seed = d(opts.seed ?? '1000');
  const hurdle = d(opts.hurdle ?? snapshot.hurdle ?? 0.1);
  const market = resolveMarket({ snapshot, seedUsd: seed, hurdleApy: hurdle });
  const capital = resolveCapital({
    seedUsd: seed,
    hurdleApy: hurdle,
    ...(opts.reserve !== undefined ? { reserveRate: d(opts.reserve) } : {}),
  });
  const stack = composeStack({
    market,
    capital,
    hurdleApy: hurdle,
    horizonDays: 365,
    includeUnwindCosts: true,
    hedgedLongShare: d('0.60'),
  });
  const step = nextStackStepProposal(stack, opts.active ?? ['liquidity_reserve'], 1);
  const intents: ActionIntent[] = step.intents.map((row) => {
    const intent: ActionIntent = {
      id: row.id,
      kind: row.kind,
      notionalUsd: row.notionalUsd,
      riskIncreasing: row.riskIncreasing,
    };
    if (row.expectedNetReturn !== undefined) intent.expectedNetReturn = row.expectedNetReturn;
    if (row.loopSteps !== undefined) intent.loopSteps = row.loopSteps;
    if (row.expectedPostState) intent.expectedPostState = row.expectedPostState;
    return intent;
  });
  return { id: step.id, intents };
}
