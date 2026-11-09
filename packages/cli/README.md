# `@shadow-banking/cli`

Paper/read-only terminal shell for Claude Code and other LLMs. Single entrypoint: `pnpm sb`.

See [`AGENTS.md`](../../AGENTS.md) for veto semantics, JSON, and the no-execution rules.

`pnpm sb risk` and `pnpm sb status` call `@shadow-banking/risk` (not a docs-only mapping). Dedicated CLI: `pnpm risk`.

`pnpm sb paper` wraps `@shadow-banking/controller`. Dedicated CLI: `pnpm paper run`.
