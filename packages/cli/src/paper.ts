import { d } from '@shadow-banking/core';
import {
  EXIT_ERROR,
  EXIT_OK,
  EXIT_VETO,
  formatPaperRun,
  paperRunToJson,
  runPaper,
} from '@shadow-banking/controller';
import { banner } from './format.js';
import { type Io } from './io.js';
import { writeOut } from './json.js';
import { flagValue, type ParsedArgs } from './parse.js';

function paperUsage(): string {
  return `Usage:
  pnpm sb paper run --steps N --seed 1000 [--snapshot <file>] [--hurdle 0.10] [--state-dir .cache/paper] [--json]
  pnpm sb paper --json

Wraps @shadow-banking/controller. Paper only — never signs or broadcasts.
Exit 2 = risk veto (the vetoed action was not executed). Hold liquid if nothing clears the hurdle.`;
}

export function cmdPaper(io: Io, args: ParsedArgs): number {
  const sub = args.rest[0] ?? 'run';
  if (sub === 'help') {
    writeOut(
      io,
      args.json,
      {
        ok: true,
        command: 'paper',
        stub: false,
        source: '@shadow-banking/controller',
        usage: paperUsage(),
      },
      paperUsage(),
    );
    return EXIT_OK;
  }
  if (sub !== 'run') {
    io.stderr.write(`unknown paper subcommand "${sub}"\n\n${paperUsage()}\n`);
    return EXIT_ERROR;
  }
  const provider = flagValue(args.flags, '--provider') ?? 'fixture';
  if (provider === 'live') {
    throw new Error(
      'live snapshot refresh: use `pnpm paper run --provider live` (async). `pnpm sb paper` is fixture/path only.',
    );
  }
  const steps = Number(flagValue(args.flags, '--steps') ?? '7');
  if (!Number.isFinite(steps) || steps < 1) throw new Error('--steps must be a positive integer');
  const seed = d(flagValue(args.flags, '--seed') ?? '1000');
  const hurdle = flagValue(args.flags, '--hurdle');
  const snapshot = flagValue(args.flags, '--snapshot');
  const stateDir = flagValue(args.flags, '--state-dir');
  const stepDaysRaw = flagValue(args.flags, '--step-days');
  const result = runPaper({
    steps,
    seedUsd: seed,
    provider: 'fixture',
    ...(hurdle ? { hurdleApy: d(hurdle) } : {}),
    ...(snapshot ? { snapshotPath: snapshot } : {}),
    ...(stateDir ? { stateDir } : {}),
    ...(stepDaysRaw ? { stepDays: Number(stepDaysRaw) } : {}),
  });
  const body = paperRunToJson(result);
  writeOut(
    io,
    args.json,
    { ...body, command: 'paper', stub: false, source: '@shadow-banking/controller' },
    banner('Paper', '@shadow-banking/controller') + '\n' + formatPaperRun(result),
  );
  return result.veto ? EXIT_VETO : EXIT_OK;
}
