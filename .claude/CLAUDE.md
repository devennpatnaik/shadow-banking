# Claude Code

Read [`AGENTS.md`](../AGENTS.md) before running anything.

- Product: **simultaneous multi-use of the same equity** (stack of legs). Not a mutually exclusive strategy picker. Details: [`docs/multi-use-stacks.md`](../docs/multi-use-stacks.md).
- Interface: `pnpm sb <command> [--json]` or `pnpm risk state|evaluate` or `pnpm paper run` or `pnpm execution propose`. Terminal only. No web UI. Market data: `pnpm opportunity refresh|show [--json]`. The governor lives in `@shadow-banking/risk`. Paper loop: `@shadow-banking/controller`. Assisted execution: `@shadow-banking/execution`.
- Parse `--json` stdout. Amounts are decimal strings.
- Exit `2` / `veto: true` is a risk-governor veto (rejected next leg / risk-increasing action). Stop. Do not bypass.
- `noDeployment: true` or `recommendedAction: "hold_liquid"` → empty productive stack (reserve/cash only). Do not invent legs. Default hurdle 10% annualized net, configurable, not a promise.
- Report active legs, per-leg earn/cost, consolidated net, HF/liquidation distance, next leg proposed or vetoed — from engine output only.
- Phases 1–4: paper/read-only. Phase 5: propose + approve only. Never execute real transactions. Never handle signing keys. `broadcast` is refused.
