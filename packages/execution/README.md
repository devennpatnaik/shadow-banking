# `@shadow-banking/execution`

Phase 5 **assisted execution**: turn paper/controller intents into structured proposals (Aave supply/borrow/repay/withdraw calldata + SDK descriptors; optional Hyperliquid hedge stub), dry-run simulate, and record an explicit user approval.

**Propose and approve only. No live transactions. No signing keys.**

```bash
pnpm execution propose --preset hold-liquid --json
pnpm execution propose --preset loop-step --net 0.12 --json
pnpm execution show --id exec-... --json
pnpm execution approve --id exec-...
pnpm execution reject --id exec-...
pnpm execution broadcast --id exec-...   # always refuses
pnpm sb execution propose --preset hold-liquid --json
```

`approve` marks the proposal file `status: "approved"`. It does **not** broadcast.

`broadcast` exits 1 with a clear error. A future Phase 6 flag `SHADOW_BANKING_PHASE6_BROADCAST=1` is required even to discuss limited automation, and this Phase 5 build still refuses.

Risk governor or spending/allowlist stub rejection → `veto: true`, exit `2`.

## Simulation

- Default: offline **mock** simulator (deterministic gas). Used in tests and CI.
- Optional RPC: `EXECUTION_RPC_URL` + `--simulator rpc` posts `eth_simulateV1` (never `eth_send*`).
- Local fork: `anvil --fork-url $ARCHIVE_RPC` then `EXECUTION_RPC_URL=http://127.0.0.1:8545`.

## Defaults

10% annualized net hurdle. `$1k` hold-liquid unless a loop-step intent clears the governor (including expected net ≥ hurdle). Never unrestricted autonomous deployment.
