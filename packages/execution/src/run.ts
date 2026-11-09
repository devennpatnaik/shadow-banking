import {
  hydrateProposal,
  readJsonFile,
  type FixtureName,
  FIXTURE_NAMES,
} from '@shadow-banking/risk';
import { applyApprove, applyReject } from './approve.js';
import { BroadcastRefused, refuseBroadcast } from './broadcast.js';
import {
  EXIT_ERROR,
  EXIT_OK,
  EXIT_VETO,
  EXECUTION_RPC_ENV,
  PHASE5_ENVELOPE,
  PHASE6_BROADCAST_ENV,
} from './envelope.js';
import { isExecutionPreset, presetProposal } from './presets.js';
import { proposeExecution } from './propose.js';
import { formatProposal, formatStored } from './report.js';
import { printJson, proposalToJson } from './serialize.js';
import { constructActions } from './construct.js';
import { resolveRpcSimulator } from './simulate.js';
import {
  defaultStateDir,
  listProposalIds,
  readProposalFile,
  writeProposal,
  writeProposalJson,
} from './store.js';

export const USAGE = `Usage:
  pnpm execution propose [--preset hold-liquid|loop-step] [--intents <file>] [--net 0.12] [--json]
  pnpm execution show --id <id> [--dir .cache/execution] [--json]
  pnpm execution approve --id <id> [--dir .cache/execution] [--json]
  pnpm execution reject --id <id> [--dir .cache/execution] [--json]
  pnpm execution broadcast --id <id>   # always refuses (Phase 5)

Phase 5 assisted execution: construct calldata/SDK descriptors, mock-simulate,
ask the risk governor, write a proposal file. approve marks approved ONLY.
It does NOT sign, submit, or broadcast. Exit 2 = governor/policy veto.

  --preset            hold-liquid (default) | loop-step
  --intents <file>    Controller/risk Proposal JSON (id + intents[])
  --net <apy>         Expected net return on risk-increasing presets (else veto)
  --hedge             Attach optional Hyperliquid hedge SDK stub
  --fixture           Governor book: normal|caution|deleveraging|emergency
  --dir / --out       Proposal directory (default .cache/execution)
  --simulator mock|rpc   mock is default and offline. rpc needs ${EXECUTION_RPC_ENV}
  --json              Machine-readable stdout

Broadcast requires unimplemented Phase 6 (${PHASE6_BROADCAST_ENV}=1) and is refused here.
No signing keys. No live transactions.
`;

export interface ExecIo {
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

function parseFixture(raw: string | undefined): FixtureName | undefined {
  if (!raw) return undefined;
  if ((FIXTURE_NAMES as readonly string[]).includes(raw)) return raw as FixtureName;
  throw new Error(`--fixture must be ${FIXTURE_NAMES.join('|')}`);
}

function requireId(rest: string[]): string {
  const id =
    arg(rest, '--id') ??
    rest.find(
      (t) =>
        !t.startsWith('-') &&
        t !== 'show' &&
        t !== 'approve' &&
        t !== 'reject' &&
        t !== 'broadcast',
    );
  if (!id) throw new Error('--id is required');
  return id;
}

export async function runExecutionCli(
  argv: readonly string[],
  io: ExecIo = {
    stdout: { write: (c) => process.stdout.write(c) },
    stderr: { write: (c) => process.stderr.write(c) },
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const tokens = argv.filter((t) => t !== '');
  const json = jsonMode(tokens);
  const cmd = tokens.find((t) => !t.startsWith('-')) ?? 'help';
  const rest = tokens.filter((t) => t !== cmd);
  const writeJson = (payload: unknown): void => {
    io.stdout.write(printJson(payload));
  };

  try {
    if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
      if (json) {
        writeJson({
          ...PHASE5_ENVELOPE,
          ok: true,
          command: 'help',
          usage: USAGE.trim(),
          commands: ['propose', 'show', 'approve', 'reject', 'broadcast'],
        });
      } else {
        io.stdout.write(USAGE);
      }
      return EXIT_OK;
    }

    const dir =
      arg(rest, '--dir') ?? arg(rest, '--out') ?? arg(rest, '--state-dir') ?? defaultStateDir();

    if (cmd === 'propose') {
      const presetRaw = arg(rest, '--preset') ?? 'hold-liquid';
      const intentsPath = arg(rest, '--intents') ?? arg(rest, '--proposal');
      const net = arg(rest, '--net');
      const proposal = intentsPath
        ? hydrateProposal(readJsonFile(intentsPath))
        : isExecutionPreset(presetRaw)
          ? presetProposal(presetRaw, net)
          : (() => {
              throw new Error(
                `unknown --preset ${presetRaw}; use ${['hold-liquid', 'loop-step'].join('|')}`,
              );
            })();
      const hurdle = arg(rest, '--hurdle');
      const fixture = parseFixture(arg(rest, '--fixture'));
      const construct = { includeHedgeStub: flag(rest, '--hedge') };
      const rpc = resolveRpcSimulator(arg(rest, '--simulator'), env);
      const simulation = rpc
        ? await rpc.simulate(constructActions(proposal.intents, construct))
        : undefined;
      const built = proposeExecution({
        proposal,
        ...(fixture ? { fixture } : {}),
        ...(hurdle ? { hurdle } : {}),
        ...(simulation ? { simulation } : {}),
        construct,
        noDeployment: proposal.intents.every((i) => i.kind === 'hold'),
      });
      const path = writeProposal(dir, built);
      const body = { ...proposalToJson(built), path, command: 'propose' };
      if (json) writeJson(body);
      else io.stdout.write(`${formatProposal(built, path)}\n`);
      return built.veto ? EXIT_VETO : EXIT_OK;
    }

    if (cmd === 'show') {
      if (flag(rest, '--list')) {
        const ids = listProposalIds(dir);
        if (json) writeJson({ ...PHASE5_ENVELOPE, ok: true, command: 'show', ids, dir });
        else io.stdout.write(ids.length ? `${ids.join('\n')}\n` : `(no proposals in ${dir})\n`);
        return EXIT_OK;
      }
      const id = requireId(rest);
      const file = readProposalFile(dir, id);
      if (json) writeJson({ ...file, command: 'show', path: `${dir}/${id}.json` });
      else io.stdout.write(`${formatStored(file, `${dir}/${id}.json`)}\n`);
      return file['veto'] === true || file['status'] === 'vetoed' ? EXIT_VETO : EXIT_OK;
    }

    if (cmd === 'approve') {
      const id = requireId(rest);
      const file = readProposalFile(dir, id);
      const next = applyApprove(file);
      const path = writeProposalJson(dir, id, next);
      if (json) writeJson({ ...next, command: 'approve', path });
      else io.stdout.write(`approved ${id} (not broadcast)\n${path}\n`);
      return EXIT_OK;
    }

    if (cmd === 'reject') {
      const id = requireId(rest);
      const file = readProposalFile(dir, id);
      const next = applyReject(file);
      const path = writeProposalJson(dir, id, next);
      if (json) writeJson({ ...next, command: 'reject', path });
      else io.stdout.write(`rejected ${id}\n${path}\n`);
      return EXIT_OK;
    }

    if (cmd === 'broadcast') {
      refuseBroadcast(env);
    }

    io.stderr.write(`unknown execution command "${cmd}"\n\n${USAGE}`);
    return EXIT_ERROR;
  } catch (err) {
    if (err instanceof BroadcastRefused) {
      const payload = {
        ...PHASE5_ENVELOPE,
        ok: false,
        command: 'broadcast',
        error: err.message,
        veto: false,
        broadcast: false,
      };
      if (json) writeJson(payload);
      else io.stderr.write(`${err.message}\n`);
      return EXIT_ERROR;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      writeJson({ ...PHASE5_ENVELOPE, ok: false, command: cmd, error: message });
    } else {
      io.stderr.write(`${message}\n`);
    }
    return EXIT_ERROR;
  }
}
