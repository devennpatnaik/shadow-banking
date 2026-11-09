export type CommandName =
  'help' | 'balance-sheet' | 'disclosures' | 'sim' | 'strategy' | 'accounting' | 'risk' | 'status';

export const COMMANDS: readonly CommandName[] = [
  'help',
  'balance-sheet',
  'disclosures',
  'sim',
  'strategy',
  'accounting',
  'risk',
  'status',
];

const ALIASES: Record<string, CommandName> = {
  help: 'help',
  '--help': 'help',
  '-h': 'help',
  'balance-sheet': 'balance-sheet',
  balancesheet: 'balance-sheet',
  bs: 'balance-sheet',
  disclosures: 'disclosures',
  disclosure: 'disclosures',
  sim: 'sim',
  simulator: 'sim',
  strategy: 'strategy',
  accounting: 'accounting',
  risk: 'risk',
  status: 'status',
};

export interface ParsedArgs {
  command: CommandName | null;
  json: boolean;
  help: boolean;
  rest: string[];
  flags: Record<string, string | true>;
  errors: string[];
}

function isFlag(token: string): boolean {
  return token.startsWith('-');
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags: Record<string, string | true> = {};
  const rest: string[] = [];
  const errors: string[] = [];
  let command: CommandName | null = null;
  let json = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) break;
    if (token === '--') {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (token === '--json') {
      json = true;
      flags['--json'] = true;
      continue;
    }
    if (token === '--format') {
      const v = argv[i + 1];
      if (v === undefined || isFlag(v)) {
        errors.push('--format requires table or json');
        continue;
      }
      i += 1;
      flags['--format'] = v;
      if (v === 'json') json = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      help = true;
      flags[token] = true;
      continue;
    }
    if (isFlag(token)) {
      const next = argv[i + 1];
      if (next !== undefined && !isFlag(next)) {
        flags[token] = next;
        i += 1;
      } else {
        flags[token] = true;
      }
      continue;
    }
    if (command === null) {
      const mapped = ALIASES[token];
      if (!mapped) {
        errors.push(`unknown command "${token}"`);
        rest.push(token);
      } else {
        command = mapped;
      }
      continue;
    }
    rest.push(token);
  }

  return { command, json, help, rest, flags, errors };
}

export function flagValue(flags: Record<string, string | true>, name: string): string | undefined {
  const v = flags[name];
  return typeof v === 'string' ? v : undefined;
}

export function flagOn(flags: Record<string, string | true>, name: string): boolean {
  return flags[name] === true || typeof flags[name] === 'string';
}

export const USAGE = `Usage:
  pnpm sb --help
  pnpm sb <command> [--json] [options]

Commands:
  status           One-screen paper summary: NAV, equity, debt, reserves, HF, hurdle, action
  balance-sheet    Consolidated balance sheet from packages/core (optional --book JSON)
  disclosures      Disclosure profile, deployable capital, required reserve (--file JSON)
  sim              Wrap the recursive-loop simulator (presets | run | compare | stress)
  strategy         Strategy economics engine (@shadow-banking/strategy)
  accounting       Accounting ledger (@shadow-banking/accounting)
  risk             Risk state from docs/risk-governor.md given a book or snapshot

Global:
  --json           Machine-readable JSON on stdout (default is a text table)
  --format json|table
  --help           This message

Paper / read-only (Phases 1–4):
  This CLI never signs, never holds keys, and never submits transactions.
  Exit 0 = ok. Exit 2 = risk-governor veto. Exit 1 = usage or runtime error.
  If recommendedAction is hold_liquid / noDeployment is true: do not deploy.
`;
