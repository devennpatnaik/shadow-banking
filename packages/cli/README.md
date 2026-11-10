# `@shadow-banking/cli`

Paper/read-only terminal shell for Claude Code and other LLMs. Single entrypoint: `pnpm sb`.

See [`AGENTS.md`](../../AGENTS.md) for veto semantics, JSON, and the no-execution rules.

`pnpm sb risk` and `pnpm sb status` call `@shadow-banking/risk` (not a docs-only mapping). Dedicated CLI: `pnpm risk`.

`pnpm sb paper` wraps `@shadow-banking/controller`. Dedicated CLI: `pnpm paper run`.

`pnpm sb execution` wraps `@shadow-banking/execution` (Phase 5 propose + approve only). Dedicated CLI: `pnpm execution`. Broadcast is refused. `--preset stack-step` proposes the next concurrent stack leg.

`pnpm sb stack` / `pnpm strategy stack` compose simultaneous uses of the same equity. Hold liquid is a reserve-only stack.
