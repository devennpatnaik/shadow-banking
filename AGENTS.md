# Agent guide — Shadow Banking CLI

This repository is operated from the **terminal**. There is no web or graphical UI. Claude Code and other LLMs should drive the paper book through `pnpm sb`.

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
```

`pnpm sb` is the paper-book entrypoint (`packages/cli`). It wraps `@shadow-banking/core`, `@shadow-banking/simulator`, `@shadow-banking/strategy`, `@shadow-banking/accounting`, and `@shadow-banking/risk`. Market snapshots are refreshed with `pnpm opportunity` (`@shadow-banking/opportunity`) in fixture or live mode; CI uses `--provider fixture` (no network). If the strategy engine recommends preserve-capital, `noDeployment` is true — **do not invent a deployment**.

Dedicated governor CLI: `pnpm risk state` / `pnpm risk evaluate` (same veto semantics).

Every command accepts `--json` (machine-readable stdout). Default output is a text table for humans.

## JSON

- Amounts and rates are **decimal strings** (e.g. `"1000"`, `"0.1"`), never binary floats.
- Envelope on every JSON document:

  `paper: true`, `execution: "forbidden"`, `phase: "1-4"`, `signingKeys: false`, `liveTransactions: false`.

- `ok: false` plus process exit `2` means a **risk-governor veto**. Exit `1` is a usage/runtime error. Exit `0` is success (including “hold liquid”).
- `status --json` fields to read first: `nav`, `equity`, `debt`, `reserves`, `healthFactor`, `hurdle`, `riskState`, `recommendedAction`, `noDeployment`, `veto`.

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

## No-deployment

`noDeployment: true` and/or `recommendedAction: "hold_liquid"` means: **preserve capital in liquid form**. No available strategy cleared the configurable hurdle (default 10% annualized **net**, not a promised return). Do not open loops, hedges, or LP positions. Do not “try a small size anyway.”

`recommendedAction` values: `hold_liquid` | `operate_paper` | `add_reserves` | `deleverage` | `unwind`.

`operate_paper` still means **paper only** in Phases 1–4.

## Never execute real transactions (Phases 1–4)

This CLI is paper / read-only:

- No signing keys, seed phrases, or venue secrets. Do not ask for them. Do not write them into the repo.
- Do not submit transactions, place orders, approve tokens, or bridge funds.
- Do not call protocol SDKs in a write path from this interface.
- Model, simulate, and report only.

## Phase 5+ (future, not implemented)

Assisted execution (user-approved intents), then limited automation, is specified in [`docs/architecture.md`](docs/architecture.md) and [`docs/implementation-plan.md`](docs/implementation-plan.md). `status --json` advertises `assistedExecution.status = "not_implemented"`. When those hooks exist they will still go through the governor, simulation, and an isolated signer — **never** through this reasoning CLI.

## Docs map

| File                                                               | Why you open it                      |
| ------------------------------------------------------------------ | ------------------------------------ |
| [`docs/spec.md`](docs/spec.md)                                     | Product spec                         |
| [`docs/architecture.md`](docs/architecture.md)                     | Components and trust boundaries      |
| [`docs/risk-governor.md`](docs/risk-governor.md)                   | Limits, states, veto, unwind         |
| [`docs/economics-1k.md`](docs/economics-1k.md)                     | Why $1k currently fails the hurdle   |
| [`packages/opportunity/README.md`](packages/opportunity/README.md) | Live/fixture market snapshot refresh |
| [`packages/risk/README.md`](packages/risk/README.md)               | Risk governor runtime and veto CLI   |

Do not add a dashboard, web app, or GUI.
