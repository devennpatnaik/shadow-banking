# Shadow Banking

An AI-managed personal shadow-banking platform: software that lets an individual operate a managed financial balance sheet of the kind normally run by banks, hedge funds, and institutional treasuries.

> **Status:** TypeScript/pnpm monorepo with a consolidated balance-sheet model (`packages/core`), recursive borrowing simulator (`simulator/`), strategy economics engine (`packages/strategy`), opportunity engine (`packages/opportunity`), accounting ledger (`packages/accounting`), risk governor (`packages/risk`), and an LLM-facing terminal CLI (`packages/cli`). See [Getting started](#getting-started). No web UI.

The full product specification lives in [`docs/spec.md`](docs/spec.md).

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
```

Read [`AGENTS.md`](AGENTS.md) (and [`.claude/CLAUDE.md`](.claude/CLAUDE.md)) before using the CLI from an agent: `--json` stdout, exit `2` = risk veto, `noDeployment` means hold liquid, Phases 1–4 never execute real transactions.

- [`packages/cli`](packages/cli/) — LLM-compatible paper/read-only shell (`status`, `balance-sheet`, `disclosures`, `sim`, `strategy`, `accounting`, `risk`).
- [`packages/core`](packages/core/) — consolidated balance-sheet model (disclosures, T0–T3 liquidity tiers, NAV, health factor, deployable capital).
- [`simulator/`](simulator/) — recursive collateralized-borrowing simulator. All printed APYs are **estimates** from a dated snapshot, not realized returns. Default hurdle: 10% annualized net, configurable.
- [`packages/strategy`](packages/strategy/) — strategy economics and risk comparison (hold LST, 2x/3x loop, hedged carry, optional LP, preserve-liquid). CLI tables plus `--json`. Default hurdle: 10% annualized net, configurable, not a promise.
- [`packages/opportunity`](packages/opportunity/) — market-snapshot refresh (fixture + live Aave/LST/Hyperliquid). Read-only. `pnpm opportunity refresh` / `show`.
- [`packages/accounting`](packages/accounting/) — double-entry ledger and consolidated performance report (CLI). Borrowed principal is not income; annualized yield is labeled an estimate.
- [`packages/risk`](packages/risk/) — risk governor runtime (states, hysteresis, hard-limit veto). `pnpm risk state` / `pnpm risk evaluate`; also used by `pnpm sb risk` and `pnpm sb status`.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check, tests, and simulator/strategy/opportunity/accounting/CLI smoke runs on Node 20 and 22.

## Documentation

| Document                                                     | Spec deliverable | Contents                                                                                                        |
| ------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| [`docs/architecture.md`](docs/architecture.md)               | §14.1            | Component map, data flow, trust boundaries, module responsibilities, domain model                               |
| [`docs/integrations.md`](docs/integrations.md)               | §14.2            | Inventory of account integrations, protocol interfaces, APIs, SDKs, and MCP servers, with sources and dates     |
| [`docs/risk-governor.md`](docs/risk-governor.md)             | §14.8            | Monitored metrics, risk states, hard limits, veto semantics, emergency unwind playbooks, fail-safes, monitoring |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | §14.9            | Milestones, deliverables, and exit criteria for the seven phases, with a dependency graph                       |

---

## Product vision

The user provides account connectivity, financial disclosures (income, expenses, assets, liabilities, liquidity needs, risk tolerance), and a seed deposit. The platform builds and manages a personal balance sheet designed to generate recurring yield, deploy capital efficiently, manage liabilities, and compound wealth over time.

The core mechanism is a managed loop:

**Equity → productive assets → collateral → borrowing → additional productive assets → recurring cash flow → retained earnings → larger balance sheet.**

The loop repeats only while the incremental return justifies the incremental risk. The system computes the optimal stopping point for recursive borrowing rather than maximizing leverage, and it must be able to conclude that no available strategy is attractive enough and hold capital in liquid form instead.

**The product's output is the user's consolidated net yield after financing costs, transaction costs, losses, and other expenses** — not a protocol's advertised APY.

This is **not** a trading bot, a robo-advisor, a portfolio tracker, or a yield aggregator. It is an automated **personal financial intermediary**.

---

## Architecture

The platform is built as ten modular services. Each has a placeholder in [`services/`](services/).

| Module                     | Directory                                                         | Responsibility                                                                                           |
| -------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Account & disclosure layer | [`services/account-disclosure`](services/account-disclosure/)     | Ingests financial data, user constraints, and available balances. Read-only by default.                  |
| Balance-sheet engine       | [`services/balance-sheet-engine`](services/balance-sheet-engine/) | Reconciles assets, liabilities, equity, collateral, and available borrowing capacity.                    |
| Opportunity engine         | [`services/opportunity-engine`](services/opportunity-engine/)     | Collects current yield, borrowing, funding, liquidity, and risk data.                                    |
| Strategy engine            | [`services/strategy-engine`](services/strategy-engine/)           | Models recursive borrowing, leveraged productive assets, hedged carry, and optional liquidity provision. |
| Risk governor              | [`services/risk-governor`](services/risk-governor/)               | Enforces hard limits and controls emergency actions. Has authority over strategy and execution.          |
| Execution layer            | [`services/execution-layer`](services/execution-layer/)           | Submits approved transactions, repayments, withdrawals, and hedges via official APIs/SDKs.               |
| Accounting engine          | [`services/accounting-engine`](services/accounting-engine/)       | Maintains the ledger and calculates NAV and net performance.                                             |
| Portfolio controller       | [`services/portfolio-controller`](services/portfolio-controller/) | Determines allocations, reserves, debt repayment, and compounding.                                       |
| User interface             | [`services/user-interface`](services/user-interface/)             | Shows the balance sheet, yield sources, debt, risk, performance, and proposed actions.                   |
| Audit & monitoring layer   | [`services/audit-monitoring`](services/audit-monitoring/)         | Records decisions, transactions, data sources, failures, and risk interventions.                         |

Workspaces alongside the services:

- [`packages/core`](packages/core/) — balance-sheet and disclosure engines (Phase 1).
- [`simulator/`](simulator/) — recursive collateral-and-borrowing loop (Phase 2).
- [`packages/strategy`](packages/strategy/) — strategy economics and risk comparison (spec §14.5).
- [`packages/opportunity`](packages/opportunity/) — opportunity engine / market snapshots (spec §14 / Phase 3 data).
- [`packages/accounting`](packages/accounting/) — ledger and performance report (spec §14.7). Text CLI; no web UI.
- [`packages/risk`](packages/risk/) — risk governor (spec §7 / §14.8). Paper/read-only CLI.
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
- **Evaluation hurdle:** **10% annualized net return**, configurable. This is a bar for comparing strategies, not a promised return and not a mandate to take more risk. If nothing clears the hurdle, the system preserves capital in liquid form.
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
│   └── spec.md              # full product specification
├── packages/
│   ├── core/                # balance-sheet domain model
│   ├── strategy/            # strategy economics + risk comparison
│   ├── opportunity/         # market snapshot refresh (fixture + live)
│   ├── accounting/          # ledger + performance CLI
│   ├── risk/                # risk governor runtime + veto CLI
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
