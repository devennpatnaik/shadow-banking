# Claude Code

Read [`AGENTS.md`](../AGENTS.md) before running anything.

- Interface: `pnpm sb <command> [--json]` or `pnpm risk state|evaluate`. Terminal only. No web UI. Market data: `pnpm opportunity refresh|show [--json]`. The governor lives in `@shadow-banking/risk`.
- Parse `--json` stdout. Amounts are decimal strings.
- Exit `2` / `veto: true` is a risk-governor veto. Stop. Do not bypass.
- `noDeployment: true` or `recommendedAction: "hold_liquid"` → hold liquid capital. Do not deploy.
- Phases 1–4: paper/read-only. Never execute real transactions. Never handle signing keys.
- Phase 5+ assisted execution is future; `assistedExecution` on `status` is a stub.
