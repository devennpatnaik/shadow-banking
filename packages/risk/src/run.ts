import { d } from '@shadow-banking/core';
import { hydrateBalanceSheet } from './book-hydrate.js';
import { snapshotFromBook, type GovernorSnapshot } from './compat.js';
import { DEFAULT_HURDLE, defaultConfig } from './config.js';
import { evaluateProposal } from './evaluate.js';
import { FIXTURE_NAMES, fixtureBook, paperDisclosure } from './fixtures.js';
import { hydrateDisclosure, hydrateMemory, hydrateProposal } from './hydrate.js';
import { hydrateGovernorSnapshot, looksLikeBalanceSheet, readJsonFile } from './load.js';
import { observationFromBook, observationFromFlat } from './observe.js';
import { formatEvaluation, formatTick } from './report.js';
import { evaluationToJson, PAPER_ENVELOPE, tickToJson } from './serialize.js';
import type { FixtureName, KillSwitch, Proposal, RiskMemory } from './types.js';

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_VETO = 2;

export interface Io {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
}

export const processIo: Io = {
  stdout: { write: (chunk) => process.stdout.write(chunk) },
  stderr: { write: (chunk) => process.stderr.write(chunk) },
};

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

function usage(): string {
  return `Usage:
  pnpm risk state [--book <file>] [--snapshot <file>] [--fixture normal|caution|deleveraging|emergency]
  pnpm risk evaluate [--proposal <file>] [--book <file>] [--snapshot <file>] [--fixture ...]
  pnpm risk state --json
  pnpm risk evaluate --json --hurdle 0.10

Paper / read-only risk governor (docs/risk-governor.md). Survival over yield.
Exit 0 = ok (including hold liquid). Exit 2 = veto. Exit 1 = usage/runtime error.
No signing keys. No live execution. No override flag.
`;
}

function parseKill(raw: string | undefined): KillSwitch {
  if (!raw || raw === 'off') return 'off';
  if (raw === 'pause' || raw === 'halt' || raw === 'unwind') return raw;
  throw new Error(`--kill must be off|pause|halt|unwind; got ${raw}`);
}

function parseFixture(raw: string | undefined): FixtureName | undefined {
  if (!raw) return undefined;
  if ((FIXTURE_NAMES as readonly string[]).includes(raw)) return raw as FixtureName;
  throw new Error(`--fixture must be ${FIXTURE_NAMES.join('|')}`);
}

function loadGovernorSnapshot(args: string[]): { snap: GovernorSnapshot; source: string } {
  const fixture = parseFixture(arg(args, '--fixture'));
  const disclosurePath = arg(args, '--disclosure');
  const disc = disclosurePath ? hydrateDisclosure(readJsonFile(disclosurePath)) : paperDisclosure();
  if (fixture) {
    return { snap: snapshotFromBook(fixtureBook(fixture), disc), source: `fixture:${fixture}` };
  }
  const snapshotPath = arg(args, '--snapshot');
  if (snapshotPath) {
    const raw = readJsonFile(snapshotPath);
    if (looksLikeBalanceSheet(raw)) {
      return { snap: snapshotFromBook(hydrateBalanceSheet(raw), disc), source: snapshotPath };
    }
    return { snap: hydrateGovernorSnapshot(raw), source: snapshotPath };
  }
  const bookPath = arg(args, '--book');
  if (bookPath) {
    return {
      snap: snapshotFromBook(hydrateBalanceSheet(readJsonFile(bookPath)), disc),
      source: bookPath,
    };
  }
  return { snap: snapshotFromBook(fixtureBook('normal'), disc), source: 'fixture:normal' };
}

export function runRiskCli(argv: readonly string[], io: Io = processIo): number {
  const [cmd, ...args] = argv.filter((t) => t !== '');
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    io.stdout.write(usage());
    return EXIT_OK;
  }

  const json = jsonMode(args);
  const writeJson = (payload: Record<string, unknown>): void => {
    io.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  };

  try {
    const hurdleRaw = arg(args, '--hurdle');
    const hurdle = hurdleRaw ? d(hurdleRaw) : DEFAULT_HURDLE;
    const config = defaultConfig({
      hurdleApy: hurdle,
      killSwitch: parseKill(arg(args, '--kill')),
    });
    const memoryPath = arg(args, '--memory');
    const memory: RiskMemory | undefined = memoryPath
      ? hydrateMemory(readJsonFile(memoryPath))
      : undefined;
    const humanAck = flag(args, '--ack');
    const { snap, source } = loadGovernorSnapshot(args);
    snap.hurdle = hurdle;

    const discPath = arg(args, '--disclosure');
    const disc = discPath ? hydrateDisclosure(readJsonFile(discPath)) : paperDisclosure();
    const fixture = parseFixture(arg(args, '--fixture'));
    const bookPath = arg(args, '--book');
    const snapshotPath = arg(args, '--snapshot');
    let obs = observationFromFlat(snap);
    if (fixture) obs = observationFromBook(fixtureBook(fixture), disc, { hurdle });
    else if (bookPath) {
      obs = observationFromBook(hydrateBalanceSheet(readJsonFile(bookPath)), disc, { hurdle });
    } else if (snapshotPath) {
      const raw = readJsonFile(snapshotPath);
      if (looksLikeBalanceSheet(raw)) {
        obs = observationFromBook(hydrateBalanceSheet(raw), disc, { hurdle });
      }
    }
    obs.hurdle = hurdle;

    const tickOpts = {
      config,
      ...(memory ? { memory } : {}),
      humanAck,
      noDeployment: !flag(args, '--operate'),
    };

    if (cmd === 'state') {
      const ticked = evaluateProposal(obs, null, tickOpts);
      if (json) writeJson({ ...tickToJson(ticked, 'state'), source });
      else io.stdout.write(`${formatTick(ticked)}\n`);
      return ticked.veto ? EXIT_VETO : EXIT_OK;
    }

    if (cmd === 'evaluate') {
      const proposalPath = arg(args, '--proposal');
      const proposal: Proposal | null = proposalPath
        ? hydrateProposal(readJsonFile(proposalPath))
        : null;
      const evaln = evaluateProposal(obs, proposal, tickOpts);
      if (json) writeJson({ ...evaluationToJson(evaln, 'evaluate'), source });
      else io.stdout.write(`${formatEvaluation(evaln)}\n`);
      return evaln.veto ? EXIT_VETO : EXIT_OK;
    }

    io.stderr.write(usage());
    return EXIT_ERROR;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      writeJson({ ...PAPER_ENVELOPE, ok: false, command: cmd, error: message });
    } else {
      io.stderr.write(`${message}\n`);
    }
    return EXIT_ERROR;
  }
}
