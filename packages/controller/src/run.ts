import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { d } from '@shadow-banking/core';
import { refreshSnapshot, resolveRefreshOptions } from '@shadow-banking/opportunity';
import { EXIT_ERROR, EXIT_OK, EXIT_VETO, PAPER_ENVELOPE } from './envelope.js';

export { EXIT_ERROR, EXIT_OK, EXIT_VETO };
import { runPaper } from './loop.js';
import { defaultStateDir, resolveSnapshotPath } from './paths.js';
import { formatPaperRun } from './report.js';
import { paperRunToJson } from './serialize.js';
import { loadPersistedRun } from './persist.js';

export const USAGE = `Usage:
  pnpm paper run --steps N --seed 1000 [--snapshot <file>] [--hurdle 0.10] [--state-dir .cache/paper] [--json]
  pnpm paper show --state-dir .cache/paper [--json]
  pnpm paper help [--json]

Phase 4 paper operation: load/refresh a market snapshot, evaluate strategies,
ask the risk governor, and apply only approved actions to a hypothetical ledger.
Never signs, never broadcasts. Exit 2 = risk veto (vetoed actions are not executed).
If nothing clears the hurdle, the book HOLDS LIQUID.

  --steps N           Clock steps (default 7). Each step is one day unless --step-days.
  --seed 1000         Paper equity (default 1000).
  --hurdle 0.10       Annualized net evaluation hurdle (not a promised return).
  --snapshot <file>   Market snapshot JSON (default docs/data/market-snapshot-2026-10-21.json).
  --provider fixture|live   Fixture is the CI default (no network). live refreshes then papers.
  --state-dir <dir>   Persist run.json + ledger.json (default .cache/paper).
  --json              Machine-readable stdout.
`;

export interface PaperIo {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
}

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function flag(args: string[], name: string): boolean {
  return args.includes(name);
}

function jsonMode(args: string[]): boolean {
  return flag(args, '--json') || arg(args, '--format') === 'json';
}

function printJson(io: PaperIo, payload: unknown): void {
  io.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export async function runPaperCli(
  argv: string[],
  io: PaperIo = {
    stdout: { write: (c) => process.stdout.write(c) },
    stderr: { write: (c) => process.stderr.write(c) },
  },
): Promise<number> {
  const json = jsonMode(argv);
  const cmd = argv.find((t) => !t.startsWith('-')) ?? 'help';
  const rest = argv.filter((t) => t !== cmd);
  try {
    if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
      if (json) {
        printJson(io, {
          ...PAPER_ENVELOPE,
          ok: true,
          command: 'help',
          usage: USAGE.trim(),
          commands: ['run', 'show', 'help'],
        });
      } else {
        io.stdout.write(USAGE);
      }
      return EXIT_OK;
    }
    if (cmd === 'show') {
      const dir = arg(rest, '--state-dir') ?? defaultStateDir();
      const loaded = loadPersistedRun(dir);
      if (json) {
        printJson(io, {
          ...PAPER_ENVELOPE,
          ok: !loaded.run.veto,
          command: 'paper',
          subcommand: 'show',
          headline: loaded.run.headline,
          veto: loaded.run.veto,
          noDeployment: loaded.run.noDeployment,
          posture: loaded.run.posture,
          nav: loaded.ledger.nav().toString(),
          debt: loaded.ledger.totalDebt().toString(),
          stateDir: dir,
        });
      } else {
        io.stdout.write(
          `${loaded.run.headline}\nstate ${dir}\nveto ${loaded.run.veto ? 'yes' : 'no'}\n`,
        );
      }
      return loaded.run.veto ? EXIT_VETO : EXIT_OK;
    }
    if (cmd !== 'run') {
      io.stderr.write(`unknown paper command "${cmd}"\n\n${USAGE}`);
      return EXIT_ERROR;
    }

    const steps = Number(arg(rest, '--steps') ?? '7');
    if (!Number.isFinite(steps) || steps < 1) throw new Error('--steps must be a positive integer');
    const seed = d(arg(rest, '--seed') ?? '1000');
    const hurdleRaw = arg(rest, '--hurdle');
    const snapshotFlag = arg(rest, '--snapshot');
    const providerRaw = arg(rest, '--provider') ?? 'fixture';
    if (providerRaw !== 'fixture' && providerRaw !== 'live') {
      throw new Error('--provider must be fixture or live');
    }
    const stateDir = arg(rest, '--state-dir') ?? join(defaultStateDir());
    const stepDays = Number(arg(rest, '--step-days') ?? '1');
    let snapshotPath = resolveSnapshotPath(snapshotFlag);

    if (providerRaw === 'live') {
      const refreshed = await refreshSnapshot(
        resolveRefreshOptions({
          provider: 'live',
          out: join(stateDir, 'snapshot.json'),
        }),
      );
      snapshotPath = refreshed.outPath ?? snapshotPath;
    }

    const result = runPaper({
      steps,
      seedUsd: seed,
      ...(hurdleRaw ? { hurdleApy: d(hurdleRaw) } : {}),
      snapshotPath,
      provider: providerRaw,
      stateDir,
      stepDays,
    });
    if (json) printJson(io, paperRunToJson(result));
    else io.stdout.write(`${formatPaperRun(result)}\n`);
    return result.veto ? EXIT_VETO : EXIT_OK;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      printJson(io, { ...PAPER_ENVELOPE, ok: false, command: 'paper', error: message });
    } else {
      io.stderr.write(`${message}\n`);
    }
    return EXIT_ERROR;
  }
}

export function tempStateDir(): string {
  return mkdtempSync(join(tmpdir(), 'sb-paper-'));
}
