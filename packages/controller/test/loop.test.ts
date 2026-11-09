import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { d } from '@shadow-banking/core';
import { EXIT_OK, EXIT_VETO, runPaperCli } from '../src/run.js';
import { runPaper } from '../src/loop.js';
import { loadPersistedRun } from '../src/persist.js';
import { resolveSnapshotPath } from '../src/paths.js';

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'sb-paper-test-'));
}

describe('paper portfolio loop', () => {
  it('holds liquid on the $1k fixture at the 10% hurdle', () => {
    const stateDir = tmpDir();
    const result = runPaper({
      steps: 3,
      seedUsd: d(1000),
      snapshotPath: resolveSnapshotPath(),
      stateDir,
    });
    expect(result.posture).toBe('hold_liquid');
    expect(result.noDeployment).toBe(true);
    expect(result.veto).toBe(false);
    expect(result.debt.toString()).toBe('0');
    expect(result.nav.toFixed(2)).toBe('1000.00');
    expect(result.headline).toMatch(/HOLD LIQUID/);
    expect(result.steps).toHaveLength(3);
    expect(result.steps.every((s) => s.executed === false)).toBe(true);
    expect(result.steps.every((s) => s.veto === false)).toBe(true);
    const persisted = loadPersistedRun(stateDir);
    expect(persisted.run.headline).toBe(result.headline);
    expect(persisted.ledger.nav().toFixed(2)).toBe('1000.00');
  });

  it('never posts a vetoed borrow to the paper ledger', () => {
    const stateDir = tmpDir();
    const result = runPaper({
      steps: 1,
      seedUsd: d(1000),
      snapshotPath: resolveSnapshotPath(),
      stateDir,
      mutateProposal: () => ({
        id: 'forced-borrow',
        intents: [
          {
            id: 'forced-borrow-0',
            kind: 'borrow',
            notionalUsd: d(400),
            riskIncreasing: true,
            expectedNetReturn: d('0.01'),
          },
        ],
      }),
    });
    expect(result.veto).toBe(true);
    expect(result.debt.toString()).toBe('0');
    expect(result.nav.toFixed(2)).toBe('1000.00');
    expect(result.steps[0]?.executed).toBe(false);
    expect(result.ledger.getBorrows()).toHaveLength(0);
  });
});

describe('pnpm paper CLI', () => {
  async function capture(
    argv: string[],
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runPaperCli(argv, {
      stdout: { write: (c) => out.push(c) },
      stderr: { write: (c) => err.push(c) },
    });
    return { code, stdout: out.join(''), stderr: err.join('') };
  }

  it('run --json --steps 2 reports hold liquid and persists', async () => {
    const stateDir = tmpDir();
    const r = await capture([
      'run',
      '--json',
      '--steps',
      '2',
      '--seed',
      '1000',
      '--snapshot',
      resolveSnapshotPath(),
      '--state-dir',
      stateDir,
      '--provider',
      'fixture',
    ]);
    expect(r.code).toBe(EXIT_OK);
    const json = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(json['paper']).toBe(true);
    expect(json['execution']).toBe('forbidden');
    expect(json['liveTransactions']).toBe(false);
    expect(json['posture']).toBe('hold_liquid');
    expect(json['noDeployment']).toBe(true);
    expect(json['veto']).toBe(false);
    expect(json['nav']).toBe('1000');
    expect(json['debt']).toBe('0');
    expect(String(json['headline'])).toMatch(/HOLD LIQUID/);
  });

  it('exits 2 when a forced below-hurdle borrow is vetoed', async () => {
    const stateDir = tmpDir();
    const result = runPaper({
      steps: 1,
      seedUsd: d(1000),
      snapshotPath: resolveSnapshotPath(),
      stateDir,
      mutateProposal: () => ({
        id: 'forced-borrow',
        intents: [
          {
            id: 'forced-borrow-0',
            kind: 'borrow',
            notionalUsd: d(400),
            riskIncreasing: true,
            expectedNetReturn: d('0.01'),
          },
        ],
      }),
    });
    expect(result.veto).toBe(true);
    const r = await capture(['show', '--json', '--state-dir', stateDir]);
    expect(r.code).toBe(EXIT_VETO);
  });
});
