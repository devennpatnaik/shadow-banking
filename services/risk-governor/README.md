# Risk governor

Enforces hard limits (leverage, position size, protocol concentration, daily loss, drawdown) and manages the risk-state machine: Normal → Caution → Deleveraging → Emergency. Has authority over the strategy engine and execution layer and can reject or override any proposed action; the AI never has unrestricted authority to move user funds.

**Runtime (Phases 1–4, paper / read-only):** [`packages/risk`](../../packages/risk/). CLI: `pnpm risk state`, `pnpm risk evaluate`, and `pnpm sb risk` / `pnpm sb status`. Spec: [`docs/risk-governor.md`](../../docs/risk-governor.md).
