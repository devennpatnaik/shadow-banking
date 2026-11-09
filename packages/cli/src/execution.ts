import {
  EXIT_ERROR,
  EXIT_OK,
  EXIT_VETO,
  PHASE5_ENVELOPE,
  formatProposal,
  formatStored,
  proposeExecution,
  proposalToJson,
  printJson as printExecJson,
  applyApprove,
  applyReject,
  refuseBroadcast,
  BroadcastRefused,
  presetProposal,
  isExecutionPreset,
  defaultStateDir,
  writeProposal,
  writeProposalJson,
  readProposalFile,
  listProposalIds,
} from '@shadow-banking/execution';
import { hydrateProposal, readJsonFile } from '@shadow-banking/risk';
import { EXIT_ERROR as CLI_ERR, type Io } from './io.js';
import { flagOn, flagValue, type ParsedArgs } from './parse.js';

function executionUsage(): string {
  return `Usage:
  pnpm sb execution propose [--preset hold-liquid|loop-step] [--net 0.12] [--json]
  pnpm sb execution show --id <id> [--json]
  pnpm sb execution approve --id <id> [--json]
  pnpm sb execution reject --id <id> [--json]
  pnpm sb execution broadcast --id <id>

Wraps @shadow-banking/execution. Phase 5: propose + approve only. Never broadcasts.
Mock simulator only on this entrypoint (no RPC). Exit 2 = risk veto.`;
}

export function cmdExecution(io: Io, args: ParsedArgs): number {
  const sub = args.rest[0] ?? 'help';
  const restFlags = args.flags;
  const dir = flagValue(restFlags, '--dir') ?? flagValue(restFlags, '--out') ?? defaultStateDir();
  const writeJson = (payload: unknown): void => {
    io.stdout.write(printExecJson(payload));
  };

  try {
    if (sub === 'help') {
      if (args.json) {
        writeJson({
          ...PHASE5_ENVELOPE,
          ok: true,
          command: 'execution',
          source: '@shadow-banking/execution',
          usage: executionUsage(),
        });
      } else {
        io.stdout.write(`${executionUsage()}\n`);
      }
      return EXIT_OK;
    }

    if (sub === 'propose') {
      const presetRaw = flagValue(restFlags, '--preset') ?? 'hold-liquid';
      const intentsPath = flagValue(restFlags, '--intents') ?? flagValue(restFlags, '--proposal');
      const net = flagValue(restFlags, '--net');
      const proposal = intentsPath
        ? hydrateProposal(readJsonFile(intentsPath))
        : isExecutionPreset(presetRaw)
          ? presetProposal(presetRaw, net)
          : (() => {
              throw new Error(`unknown --preset ${presetRaw}`);
            })();
      const hurdle = flagValue(restFlags, '--hurdle');
      const fixtureRaw = flagValue(restFlags, '--fixture');
      const built = proposeExecution({
        proposal,
        ...(fixtureRaw === 'normal' ||
        fixtureRaw === 'caution' ||
        fixtureRaw === 'deleveraging' ||
        fixtureRaw === 'emergency'
          ? { fixture: fixtureRaw }
          : {}),
        ...(hurdle ? { hurdle } : {}),
        construct: { includeHedgeStub: flagOn(restFlags, '--hedge') },
        noDeployment: proposal.intents.every((i) => i.kind === 'hold'),
      });
      const path = writeProposal(dir, built);
      if (args.json) writeJson({ ...proposalToJson(built), path, command: 'execution' });
      else io.stdout.write(`${formatProposal(built, path)}\n`);
      return built.veto ? EXIT_VETO : EXIT_OK;
    }

    if (sub === 'show') {
      if (flagOn(restFlags, '--list')) {
        const ids = listProposalIds(dir);
        if (args.json) writeJson({ ...PHASE5_ENVELOPE, ok: true, command: 'execution', ids, dir });
        else io.stdout.write(ids.length ? `${ids.join('\n')}\n` : `(no proposals in ${dir})\n`);
        return EXIT_OK;
      }
      const id = flagValue(restFlags, '--id');
      if (!id) throw new Error('--id is required');
      const file = readProposalFile(dir, id);
      if (args.json) writeJson({ ...file, command: 'execution' });
      else io.stdout.write(`${formatStored(file)}\n`);
      return file['veto'] === true || file['status'] === 'vetoed' ? EXIT_VETO : EXIT_OK;
    }

    if (sub === 'approve' || sub === 'reject') {
      const id = flagValue(restFlags, '--id');
      if (!id) throw new Error('--id is required');
      const file = readProposalFile(dir, id);
      const next = sub === 'approve' ? applyApprove(file) : applyReject(file);
      writeProposalJson(dir, id, next);
      if (args.json) writeJson({ ...next, command: 'execution' });
      else io.stdout.write(`${sub}d ${id} (not broadcast)\n`);
      return EXIT_OK;
    }

    if (sub === 'broadcast') {
      refuseBroadcast();
    }

    io.stderr.write(`unknown execution subcommand "${sub}"\n\n${executionUsage()}\n`);
    return EXIT_ERROR;
  } catch (err) {
    if (err instanceof BroadcastRefused) {
      const payload = {
        ...PHASE5_ENVELOPE,
        ok: false,
        command: 'execution',
        error: err.message,
        broadcast: false,
      };
      if (args.json) io.stdout.write(printExecJson(payload));
      else io.stderr.write(`${err.message}\n`);
      return CLI_ERR;
    }
    throw err;
  }
}
