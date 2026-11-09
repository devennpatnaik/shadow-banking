# `@shadow-banking/risk`

Paper/read-only **risk governor** (spec §7, [`docs/risk-governor.md`](../../docs/risk-governor.md)).

- States: `Normal` → `Caution` → `Deleveraging` → `Emergency` with documented entry/exit hysteresis.
- Hard limits veto strategy/execution proposals. Survival over yield. No override flag.
- CLI: `pnpm risk state` and `pnpm risk evaluate` (tables or `--json`). Exit `2` on veto.
- Also used by `pnpm sb risk` and `pnpm sb status`.

Phases 1–4: no signing keys, no live transactions.
