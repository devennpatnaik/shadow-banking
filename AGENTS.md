# Agent guide — Shadow Banking CLI

This repository is operated from the **terminal**. There is no web or graphical UI. Claude Code and other LLMs should drive the paper book through `pnpm sb`.

**Product:** simultaneous **multi-use of the same equity** (a stack of legs), not a choice among mutually exclusive strategies. Hold-liquid is the empty productive stack. See [`docs/multi-use-stacks.md`](docs/multi-use-stacks.md).

## How to run

From the repo root (Node 20+, pnpm):

```bash
corepack enable
pnpm install
pnpm sb --help
pnpm sb status --json
pnpm sb balance-sheet --json
pnpm sb disclosures --json
pnpm sb sim --json --preset aave-v3-ethereum-wsteth-eth-emode --seed 1000
pnpm sb risk --json
pnpm sb strategy --json
pnpm sb accounting --json
pnpm opportunity show --json
pnpm opportunity refresh --provider fixture --json
pnpm risk state --json
pnpm risk evaluate --json --fixture caution
pnpm paper run --steps 7 --seed 1000 --json
pnpm sb paper run --steps 7 --seed 1000 --json
pnpm execution propose --preset hold-liquid --json
pnpm execution show --id <id> --json
pnpm sb execution propose --preset hold-liquid --json
```

`pnpm sb` is the paper-book entrypoint (`packages/cli`). It wraps `@shadow-banking/core`, `@shadow-banking/simulator`, `@shadow-banking/strategy`, `@shadow-banking/accounting`, `@shadow-banking/risk`, and `@shadow-banking/controller`. Market snapshots are refreshed with `pnpm opportunity` (`@shadow-banking/opportunity`) in fixture or live mode; CI uses `--provider fixture` (no network). Phase 4 paper loop: `pnpm paper run --steps N --seed 1000` (or `pnpm sb paper`). If `noDeployment` is true, the productive stack is empty — **do not invent legs or a deployment**.

Dedicated governor CLI: `pnpm risk state` / `pnpm risk evaluate` (same veto semantics). Paper controller: `pnpm paper run` / `pnpm paper show`. Assisted execution: `pnpm execution propose|show|approve|reject` (Phase 5; broadcast refused).

Every command accepts `--json` (machine-readable stdout). Default output is a text table for humans.

## JSON

- Amounts and rates are **decimal strings** (e.g. `"1000"`, `"0.1"`), never binary floats.
- Envelope on every JSON document:

  Paper commands: `paper: true`, `execution: "forbidden"`, `phase: "1-4"`, `signingKeys: false`, `liveTransactions: false`.

  Execution commands: `paper: true`, `execution: "propose_only"`, `phase: "5"`, `signingKeys: false`, `liveTransactions: false`, `broadcast: false`.

- `ok: false` plus process exit `2` means a **risk-governor veto**. Exit `1` is a usage/runtime error. Exit `0` is success (including “hold liquid”).
- `status --json` fields to read first: `nav`, `equity`, `debt`, `reserves`, `healthFactor`, `hurdle`, `riskState`, `recommendedAction`, `noDeployment`, `veto`.
- Answer from the book (do not invent): which simultaneous uses of this equity are active, what each leg earns/costs, consolidated net after financing/fees/hedges/expected losses, HF / liquidation distance, and what next leg is proposed or vetoed. Today's status JSON may not yet list `legs`; reconstruct from balance-sheet, strategy, sim, risk, paper, and execution output.

Example shape (`pnpm sb status --json`):

```json
{
  "paper": true,
  "execution": "forbidden",
  "phase": "1-4",
  "signingKeys": false,
  "liveTransactions": false,
  "ok": true,
  "command": "status",
  "nav": "1000",
  "equity": "1000",
  "debt": "0",
  "reserves": "1000",
  "healthFactor": null,
  "hurdle": "0.1",
  "riskState": "Normal",
  "veto": false,
  "recommendedAction": "hold_liquid",
  "noDeployment": true
}
```

## Risk governor vetoes

Rules: [`docs/risk-governor.md`](docs/risk-governor.md). The CLI recomputes state from a book or snapshot. It does **not** trust a caller-supplied state.

- States: `Normal` | `Caution` | `Deleveraging` | `Emergency`. Implemented by `@shadow-banking/risk` (not a docs mapping). Entry is worst-of; exit uses hysteresis + dwell from [`docs/risk-governor.md`](docs/risk-governor.md).
- **Veto** (`veto: true`, exit `2`): `Deleveraging` or `Emergency`, or a rejected proposal. Reject every risk-increasing action. You may not work around a veto in text, code, or by calling a different command.
- `Caution`: stop increasing leverage; prefer reserves. Not a veto, still `noDeployment: true`.
- There is no override flag. Loosening limits is a signed, time-locked human configuration change, not an agent action.

## No-deployment (empty productive stack)

`noDeployment: true` and/or `recommendedAction: "hold_liquid"` means the stack has **only the reserve/cash leg**. No additional leg cleared the configurable hurdle (default 10% annualized **net**, not a promised return). Do not open loops, hedges, or LP positions. Do not “try a small size anyway.” Hold-liquid is not a competing product identity; it is the stopping rule.

`recommendedAction` values: `hold_liquid` | `operate_paper` | `add_reserves` | `deleverage` | `unwind`.

`operate_paper` still means **paper only** in Phases 1–4.

## Never execute real transactions (Phases 1–5)

This CLI does not broadcast:

- No signing keys, seed phrases, or venue secrets. Do not ask for them. Do not write them into the repo.
- Do not submit transactions, place orders, approve tokens, or bridge funds.
- Do not call protocol SDKs in a write path from this interface.
- Model, simulate, propose, and record approvals only.

## Phase 5 — propose + approve only

Assisted execution lives in `@shadow-banking/execution` (`pnpm execution`, `pnpm sb execution`):

- `propose` writes a proposal file (calldata/SDK descriptors, mock or optional RPC dry-run, accounting impact, unwind plan, risk state).
- `show` reads it. `approve` marks `status: "approved"` and does **not** broadcast. `reject` marks rejected.
- `broadcast` always refuses. A future Phase 6 flag `SHADOW_BANKING_PHASE6_BROADCAST=1` is off by default and still does not send txs in this build.
- Governor or spending/allowlist stub rejection → `veto: true`, exit `2`.
- Optional RPC: `EXECUTION_RPC_URL` + `--simulator rpc` (`eth_simulateV1` / anvil fork). Tests and CI use the mock simulator (offline).
- `status --json` `assistedExecution.status` is `propose_approve_only`. Limited automation (Phase 6) is not implemented. Never unrestricted autonomous deployment.

## Docs map

| File                                                               | Why you open it                          |
| ------------------------------------------------------------------ | ---------------------------------------- |
| [`docs/spec.md`](docs/spec.md)                                     | Product spec                             |
| [`docs/multi-use-stacks.md`](docs/multi-use-stacks.md)             | Legs, consolidated net, hold-liquid      |
| [`docs/architecture.md`](docs/architecture.md)                     | Components and trust boundaries          |
| [`docs/risk-governor.md`](docs/risk-governor.md)                   | Limits, states, veto, unwind             |
| [`docs/economics-1k.md`](docs/economics-1k.md)                     | Why $1k currently fails the hurdle       |
| [`packages/opportunity/README.md`](packages/opportunity/README.md) | Live/fixture market snapshot refresh     |
| [`packages/risk/README.md`](packages/risk/README.md)               | Risk governor runtime and veto CLI       |
| [`packages/controller/README.md`](packages/controller/README.md)   | Phase 4 paper portfolio controller       |
| [`packages/execution/README.md`](packages/execution/README.md)     | Phase 5 propose + approve (no broadcast) |

Do not add a dashboard, web app, or GUI.
