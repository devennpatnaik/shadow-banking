# Shadow Banking

An AI-managed personal shadow-banking platform: software that puts **one dollar of equity to work in several techniques at the same time** — the kind of stacked balance sheet normally run by banks, hedge funds, and institutional treasuries.

The product is a **simultaneous multi-use stack** (yield-bearing asset, collateral, borrow, redeploy, optional hedge, plus a reserve that is not double-counted as productive), not a picker among mutually exclusive strategies. See [`docs/multi-use-stacks.md`](docs/multi-use-stacks.md).

> **Status:** TypeScript/pnpm monorepo with a consolidated balance-sheet model (`packages/core`), recursive borrowing simulator (`simulator/`), strategy economics engine (`packages/strategy`), opportunity engine (`packages/opportunity`), accounting ledger (`packages/accounting`), risk governor (`packages/risk`), paper portfolio controller (`packages/controller`), Phase 5 assisted execution (`packages/execution`), and an LLM-facing terminal CLI (`packages/cli`). See [Getting started](#getting-started). No web UI.

The full product specification lives in [`docs/spec.md`](docs/spec.md). Multi-use stacks: [`docs/multi-use-stacks.md`](docs/multi-use-stacks.md).

---

## Getting started

Stack: **TypeScript**, Node 20+ LTS, **pnpm** workspaces, strict TypeScript, **vitest**, **decimal.js** for every balance and rate. One language across the engines, the agent CLI, and the Aave / Hyperliquid SDK ecosystems. Floating point is never used for money.

The operator interface is a **text CLI for Claude Code and other agents** (`pnpm sb`). There is no web or graphical dashboard.

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm sb --help
pnpm sb status --json
pnpm sb sim --json --preset aave-v3-ethereum-wsteth-eth-emode --seed 1000
pnpm sim run --preset aave-v3-ethereum-wsteth-eth-emode --seed 1000
pnpm sim compare --seed 1000
pnpm strategy compare --snapshot docs/data/market-snapshot-2026-10-21.json --seed 1000
pnpm strategy compare --snapshot docs/data/market-snapshot-2026-10-21.json --seed 1000 --json
pnpm opportunity refresh --provider fixture --json
pnpm opportunity show --json
pnpm accounting report
pnpm accounting ledger --json
pnpm risk state --json
pnpm risk evaluate --json --fixture caution
pnpm paper run --steps 7 --seed 1000 --json
pnpm sb paper run --steps 7 --seed 1000 --json
pnpm execution propose --preset hold-liquid --json
pnpm sb execution propose --preset hold-liquid --json
```

Read [`AGENTS.md`](AGENTS.md) (and [`.claude/CLAUDE.md`](.claude/CLAUDE.md)) before using the CLI from an agent: `--json` stdout, exit `2` = risk veto, `noDeployment` / `hold_liquid` is the empty productive stack (reserve/cash only), Phase 5 is propose+approve only (no live txs).

- [`packages/cli`](packages/cli/) — LLM-compatible paper/read-only shell (`status`, `balance-sheet`, `disclosures`, `sim`, `strategy`, `accounting`, `risk`, `paper`, `execution`).
- [`packages/core`](packages/core/) — consolidated balance-sheet model (disclosures, T0–T3 liquidity tiers, NAV, health factor, deployable capital).
- [`simulator/`](simulator/) — recursive collateralized-borrowing simulator. All printed APYs are **estimates** from a dated snapshot, not realized returns. Default hurdle: 10% annualized net, configurable.
- [`packages/strategy`](packages/strategy/) — stack economics: compose simultaneous legs on the same equity; single-strategy compare (hold LST, loop, hedged carry, LP, preserve-liquid) is a diagnostic. CLI tables plus `--json`. Default hurdle: 10% annualized net, configurable, not a promise.
- [`packages/opportunity`](packages/opportunity/) — market-snapshot refresh (fixture + live Aave/LST/Hyperliquid). Read-only. `pnpm opportunity refresh` / `show`.
- [`packages/accounting`](packages/accounting/) — double-entry ledger and consolidated performance report (CLI). Borrowed principal is not income; annualized yield is labeled an estimate.
- [`packages/risk`](packages/risk/) — risk governor runtime (states, hysteresis, hard-limit veto). `pnpm risk state` / `pnpm risk evaluate`; also used by `pnpm sb risk` and `pnpm sb status`.
- [`packages/controller`](packages/controller/) — Phase 4 paper portfolio loop (snapshot → strategies → veto → hypothetical ledger). `pnpm paper run`; also `pnpm sb paper`.
- [`packages/execution`](packages/execution/) — Phase 5 assisted execution (`propose` / `show` / `approve` / `reject`). Broadcast refused. Mock simulator offline; optional `EXECUTION_RPC_URL`.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check, tests, and simulator/strategy/opportunity/accounting/CLI smoke runs on Node 20 and 22.

## Documentation

| Document                                                     | Spec deliverable | Contents                                                                                                        |
| ------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| [`docs/architecture.md`](docs/architecture.md)               | §14.1            | Component map, data flow, trust boundaries, module responsibilities, domain model                               |
| [`docs/multi-use-stacks.md`](docs/multi-use-stacks.md)       | —                | Simultaneous legs on the same equity, consolidated net yield, hold-liquid as the empty productive stack         |
| [`docs/integrations.md`](docs/integrations.md)               | §14.2            | Inventory of account integrations, protocol interfaces, APIs, SDKs, and MCP servers, with sources and dates     |
| [`docs/risk-governor.md`](docs/risk-governor.md)             | §14.8            | Monitored metrics, risk states, hard limits, veto semantics, emergency unwind playbooks, fail-safes, monitoring |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | §14.9            | Milestones, deliverables, and exit criteria for the seven phases, with a dependency graph                       |

---

## Product vision

The user provides account connectivity, financial disclosures (income, expenses, assets, liabilities, liquidity needs, risk tolerance), and a seed deposit. The platform builds and manages a personal balance sheet so that **the same equity is used in several techniques at once**.

The core mechanism is a **stack**, not a single play:

**Equity → (productive asset ∧ collateral ∧ borrow ∧ redeploy ∧ optional hedge) + reserve → consolidated net cash flow → retained earnings → larger balance sheet.**

Each additional leg is optional in the sense that it must earn its keep; it is not optional as product identity. Add a leg only while incremental **net** return justifies incremental risk versus the configurable hurdle (default **10% annualized net**, not a promised return). **Hold liquid** is the stack with only the reserve/cash leg — not a peer product that “wins” against the loop.

**The product's output is the user's consolidated net yield after financing costs, transaction costs, hedges, losses, and other expenses** — not a protocol's advertised APY, and not a per-strategy gross rate.

This is **not** a trading bot, a robo-advisor, a portfolio tracker, or a yield aggregator. It is an automated **personal financial intermediary**.

---

## Architecture

The platform is built as ten modular services. Each has a placeholder in [`services/`](services/).

| Module                     | Directory                                                         | Responsibility                                                                                           |
| -------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Account & disclosure layer | [`services/account-disclosure`](services/account-disclosure/)     | Ingests financial data, user constraints, and available balances. Read-only by default.                  |
| Balance-sheet engine       | [`services/balance-sheet-engine`](services/balance-sheet-engine/) | Reconciles assets, liabilities, equity, collateral, and available borrowing capacity.                    |
| Opportunity engine         | [`services/opportunity-engine`](services/opportunity-engine/)     | Collects current yield, borrowing, funding, liquidity, and risk data.                                    |
| Strategy engine            | [`services/strategy-engine`](services/strategy-engine/)           | Composes a simultaneous multi-use stack; single-strategy models are diagnostics for candidate legs.      |
| Risk governor              | [`services/risk-governor`](services/risk-governor/)               | Enforces hard limits and controls emergency actions. Has authority over strategy and execution.          |
| Execution layer            | [`services/execution-layer`](services/execution-layer/)           | Submits approved transactions, repayments, withdrawals, and hedges via official APIs/SDKs.               |
| Accounting engine          | [`services/accounting-engine`](services/accounting-engine/)       | Maintains the ledger and calculates NAV and net performance.                                             |
| Portfolio controller       | [`services/portfolio-controller`](services/portfolio-controller/) | Determines allocations, reserves, debt repayment, and compounding.                                       |
| User interface             | [`services/user-interface`](services/user-interface/)             | Shows the balance sheet, yield sources, debt, risk, performance, and proposed actions.                   |
| Audit & monitoring layer   | [`services/audit-monitoring`](services/audit-monitoring/)         | Records decisions, transactions, data sources, failures, and risk interventions.                         |

Workspaces alongside the services:

- [`packages/core`](packages/core/) — balance-sheet and disclosure engines (Phase 1).
- [`simulator/`](simulator/) — recursive collateral-and-borrowing loop (Phase 2).
- [`packages/strategy`](packages/strategy/) — stack composer and diagnostic strategy compare (spec §14.5).
- [`packages/opportunity`](packages/opportunity/) — opportunity engine / market snapshots (spec §14 / Phase 3 data).
- [`packages/accounting`](packages/accounting/) — ledger and performance report (spec §14.7). Text CLI; no web UI.
- [`packages/risk`](packages/risk/) — risk governor (spec §7 / §14.8). Paper/read-only CLI.
- [`packages/controller`](packages/controller/) — paper portfolio controller (spec §13 Phase 4).
- [`packages/cli`](packages/cli/) — agent-facing terminal interface (replaces a live-data dashboard). Paper/read-only.
- [`dashboard/`](dashboard/) — placeholder; live output is CLI/structured text, not a graphical dashboard.

---

## Build sequence

Development is incremental. Each phase must be reliable before the next begins.

| Phase | Name                      | Scope                                                                                                                                       |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Read-only financial model | Connect data sources, ingest disclosures, build the consolidated balance sheet. No transactions.                                            |
| 2     | Shadow-bank simulator     | Model the recursive collateral-and-borrowing loop for at least two asset ecosystems. Compute leverage, net yield, equity, liquidation risk. |
| 3     | Opportunity & risk engine | Compare strategies on current and historical data. Implement reserves, risk limits, stress tests, and a no-deployment state.                |
| 4     | Paper operation           | Run the full controller on live data with no real transactions. Track hypothetical NAV, debt, income, costs, drawdowns.                     |
| 5     | Assisted execution        | Propose specific actions for user approval. Verify transaction construction, accounting, repayments, unwinds.                               |
| 6     | Limited automation        | Deploy a small authorized allocation with hard-coded limits, independent risk controls, monitoring, and emergency shutdown.                 |
| 7     | Broader management        | Expand strategies and automation only after reliable accounting, execution, and risk handling are demonstrated.                             |

**Unrestricted autonomous deployment is never a phase.**

---

## Starting assumptions

These are initial parameters for design and simulation, not conclusions.

- **Seed capital:** approximately **$1,000** to validate the system. The architecture must scale to larger balances.
- **Evaluation hurdle:** **10% annualized net return**, configurable. This is a bar for adding the next stack leg, not a promised return and not a mandate to take more risk. If no additional leg clears the hurdle, the system keeps the empty productive stack (liquid reserve only).
- **Liquidity reserve:** **10–30% of deployable capital** as a simulation starting point, not a universal rule. The actual level depends on obligations, volatility, liquidation risk, and withdrawal access.

---

## Enabling layer

DeFi protocols — accessed through their official APIs, SDKs, and where useful MCP interfaces — are the enabling layer for this project.

Candidate integrations **to evaluate, not commitments**:

- **Aave** — lending market for collateral management, borrowing, repayment, interest-rate data, and liquidation information.
- **Hyperliquid** — perpetual-futures venue for hedging unwanted price exposure on long productive-asset positions.

An MCP interface may help an AI agent discover or invoke tools, but it is not a substitute for a reliable execution and risk-control layer. Every strategy must demonstrate a clear economic mechanism, verifiable data, measurable costs, a defined risk model, a reliable entry/exit process, and a programmatic execution path before it is added.

---

## Risk disclaimer

**This software does not and cannot guarantee any yield, protect principal, or ensure uninterrupted withdrawals.**

Capital deployed through the strategies this platform models or executes can be lost — partially or entirely — through, among other things:

- smart-contract bugs or exploits,
- forced liquidation of collateralized positions,
- stablecoin depegs,
- protocol insolvency or withdrawal freezes,
- oracle failures, funding-rate reversals, hedge failures, and counterparty default,
- market stress, impaired liquidity, and changes to protocol terms.

The risk governor is designed to prioritize survival over yield and to reject or override any proposed action, but no risk system eliminates these risks.

**This is software, not financial, legal, or tax advice.** Nothing in this repository constitutes a recommendation to buy, sell, borrow against, or hold any asset. Before any real-money operation, applicable registration, licensing, disclosure, custody, lending, derivatives, consumer-protection, privacy, tax, and sanctions rules must be assessed; non-custodial software is not automatically exempt from regulation.

---

## Repository layout

```
.
├── README.md
├── AGENTS.md                # how Claude Code / other LLMs run pnpm sb
├── docs/
│   ├── spec.md              # full product specification
│   └── multi-use-stacks.md  # simultaneous legs; consolidated net; hold-liquid
├── packages/
│   ├── core/                # balance-sheet domain model
│   ├── strategy/            # stack composer + diagnostic compare
│   ├── opportunity/         # market snapshot refresh (fixture + live)
│   ├── accounting/          # ledger + performance CLI
│   ├── risk/                # risk governor runtime + veto CLI
│   ├── controller/          # Phase 4 paper portfolio controller
│   └── cli/                 # LLM-facing CLI (no web UI)
├── services/
│   ├── account-disclosure/
│   ├── balance-sheet-engine/
│   ├── opportunity-engine/
│   ├── strategy-engine/
│   ├── risk-governor/
│   ├── execution-layer/
│   ├── accounting-engine/
│   ├── portfolio-controller/
│   ├── user-interface/
│   └── audit-monitoring/
├── simulator/
└── dashboard/               # retired as a deliverable; see packages/cli
```

No license has been chosen yet.
