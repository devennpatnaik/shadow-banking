import { resolveRefreshOptions, refreshSnapshot } from './refresh.js';
import { formatShow, loadSnapshotFile, resolveShowPath } from './show.js';
import { datedOutPath, repoRootFrom } from './paths.js';

export const USAGE = `Usage:
  pnpm opportunity refresh [--provider fixture|live] [--fixture <file>] [--out docs/data/market-snapshot-<date>.json] [--json]
  pnpm opportunity show [--snapshot <file>] [--json]
  pnpm opportunity help [--json]

Refresh writes the existing market-snapshot JSON shape (schemaVersion 1) so
\`pnpm strategy compare --snapshot …\` and \`pnpm sim run --snapshot …\` can consume it.

Providers:
  fixture   Copy docs/data/market-snapshot-2026-10-21.json (default in CI / --offline). No network.
  live      Aave GraphQL (v3 Core/Arbitrum/Base rates, LTV, LT, eMode) + LST yields
            (Lido SMA, Rocket Pool APR, Coinbase cbETH, Jito) + Hyperliquid funding (best-effort).
            Unfetched fields keep fixture values with their original source/asOf. Never invented.

Env:
  OPPORTUNITY_PROVIDER=fixture|live
  OPPORTUNITY_OFFLINE=1          Treat as fixture; HTTP only from cache
  OPPORTUNITY_CACHE_DIR          Default .cache/opportunity
  OPPORTUNITY_FIXTURE            Default docs/data/market-snapshot-2026-10-21.json
  AAVE_GRAPHQL_URL               Default https://api.v3.aave.com/graphql
  HYPERLIQUID_INFO_URL           Default https://api.hyperliquid.xyz/info
  ETHEREUM_RPC_URL               Optional; spot gas only (no history invented)
  ARBITRUM_RPC_URL               Optional
  BASE_RPC_URL                   Optional

Phases 1–4 read-only. No signing, no orders, no UI.
`;

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  return args[i + 1];
}

function flag(args: string[], name: string): boolean {
  return args.includes(name);
}

function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export async function main(argv: string[]): Promise<number> {
  const json = argv.includes('--json') || arg(argv, '--format') === 'json';
  const stripped = argv.filter((t, i) => {
    if (t === '--json') return false;
    if (t === '--format' && argv[i + 1] === 'json') return false;
    if (t === 'json' && argv[i - 1] === '--format') return false;
    return true;
  });
  const [, , cmd, ...args] = stripped;
  try {
    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
      if (json) {
        printJson({
          ok: true,
          command: 'help',
          usage: USAGE.trim(),
          commands: ['refresh', 'show', 'help'],
          paper: true,
          execution: 'forbidden',
        });
      } else {
        process.stdout.write(USAGE);
      }
      return 0;
    }
    if (cmd === 'show') {
      const path = resolveShowPath(arg(args, '--snapshot'));
      const snapshot = loadSnapshotFile(path);
      if (json) {
        printJson({
          ok: true,
          command: 'show',
          path,
          paper: true,
          execution: 'forbidden',
          snapshot,
        });
      } else {
        process.stdout.write(`${formatShow(path, snapshot)}\n`);
      }
      return 0;
    }
    if (cmd === 'refresh') {
      const provider = arg(args, '--provider');
      const opts = resolveRefreshOptions(
        {
          ...(provider ? { provider } : {}),
          ...(arg(args, '--fixture') ? { fixture: arg(args, '--fixture') } : {}),
          ...(arg(args, '--out')
            ? { out: arg(args, '--out') }
            : provider === 'fixture' || flag(args, '--offline')
              ? {}
              : { out: datedOutPath(new Date(), repoRootFrom()) }),
          ...(arg(args, '--cache-dir') ? { 'cache-dir': arg(args, '--cache-dir') } : {}),
          ...(flag(args, '--offline') ? { offline: '1' } : {}),
        },
        process.env,
      );
      const result = await refreshSnapshot(opts);
      if (json) {
        printJson({
          ok: true,
          command: 'refresh',
          paper: true,
          execution: 'forbidden',
          out: result.outPath ?? null,
          meta: result.meta,
          snapshot: result.snapshot,
        });
      } else {
        const deg = result.meta.degradations;
        process.stdout.write(
          `refresh ${result.meta.mode} → ${result.outPath ?? '(stdout/memory)'}\n` +
            `providers: ${result.meta.providers.join(', ')}\n` +
            `network: ${result.meta.networkUsed ? 'yes' : 'no'}\n` +
            (deg.length
              ? `degradations:\n${deg.map((d) => `  - ${d.provider}: ${d.reason}`).join('\n')}\n`
              : '') +
            `snapshotDate ${result.snapshot.snapshotDate} assets ${result.snapshot.assets.length} markets ${result.snapshot.markets.length}\n`,
        );
      }
      return 0;
    }
    const err = `unknown command ${cmd}`;
    if (json) printJson({ ok: false, command: cmd, error: err, usage: USAGE.trim() });
    else process.stderr.write(`${err}\n${USAGE}`);
    return 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) printJson({ ok: false, error: message, paper: true, execution: 'forbidden' });
    else process.stderr.write(`${message}\n`);
    return 1;
  }
}
