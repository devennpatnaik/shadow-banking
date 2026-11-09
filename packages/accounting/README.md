# Accounting ledger and performance report

Spec §8–9 / §14 item 7. Double-entry ledger of assets, liabilities, cash flows, and transactions, plus a **consolidated** performance report. This is not a protocol APY viewer.

CLI only (no web UI). Money is `decimal.js` via `@shadow-banking/core`. The 10% annualized net figure is an **evaluation hurdle**, not a promised return.

## Commands

From the repo root (after `pnpm install`):

```bash
pnpm accounting report
pnpm accounting report --json
pnpm accounting ledger
pnpm accounting ledger --json
pnpm accounting allocate --risk-state Normal
pnpm accounting init --fixture seed-1k --out data/ledger.json
pnpm accounting report --ledger data/ledger.json --hurdle 0.10
```

`--ledger` accepts a `.json` file or a directory. If omitted, the bundled `$1,000` seed fixture is used.

## Persistence format

`schemaVersion` 1 document, kind `shadow-banking-ledger`. All money and rates are **decimal strings** (never floats).

**File:** `path/to/ledger.json`

**Directory:**

| File            | Contents                                       |
| --------------- | ---------------------------------------------- |
| `ledger.json`   | Full document (source of truth for load)       |
| `meta.json`     | Currency, accounts, instruments, hurdle        |
| `journal.jsonl` | One journal entry per line (LLM-friendly grep) |

Top-level fields:

- `state.meta` — reporting currency, venue `accounts`, `instruments` (with optional Aave-style `collateralParams`)
- `state.entries` — balanced journal (`debits = credits`). Categories: `income`, `expense`, `transfer`, `equity`, `valuation`, `financing`
- `state.holdings` / `state.borrows` — subledger lots
- `state.raw` — trial-balance raw debit−credit per chart account
- `state.snapshots` — NAV / unit NAV after each entry (drawdown)
- `display` — the same book in the CLI JSON shape

Economic rules enforced on post:

- **Borrow / repay** cannot hit P&L (borrowed principal is not income).
- **Transfers, pledges, lending supply** cannot hit P&L.
- **Seed / deposit / withdrawal** are equity, not income.

`NAV = fair value of assets − liabilities`. Unit NAV strips deposits and withdrawals so drawdown is performance, not capital flows.

## Chart of accounts

Assets: `cash`, `productive_assets`, `collateral_assets`, `lending_assets`, `other_assets`  
Liabilities: `borrow_principal`, `accrued_interest`  
Equity: `contributed_capital`, `withdrawals`, `unrealized_pnl`  
Income: staking, lending, funding received, LP, incentives, realized P&L  
Expenses: fees, financing cost, funding paid, liquidation, other loss, operating

## Report

Primary output is consolidated performance: NAV, net P&L, net annualized yield (**estimate**), realized return, ROIE, ROAE, return on deployed capital, gross assets/equity, total debt and financing costs, liquid reserves, max drawdown, liquidation exposure (health factor / drop-to-liq from `@shadow-banking/core`).

Realized income/expense is separated from unrealized marks. Annualized yield is `(1 + unitNav period return)^(365/days) − 1` and is always labeled an estimate.

## Retained-earnings allocator stub

`pnpm accounting allocate` recommends how to split **already realized** net earnings: repay debt, add collateral, buy yield assets, raise reserves, fund expenses. It does **not** execute. Emergency/Deleveraging/Caution never buy yield assets. If estimated net yield does not clear the evaluation hurdle, the stub holds liquid.

## Fixture

`packages/accounting/fixtures/seed-1k.json` is a 90-day paper book on a **$1,000** seed: $200 reserve, wstETH productive collateral, $150 USDC borrow (not income), Aave USDC supply, staking/lending/funding/LP/incentive credits, marks (including a drawdown), $25 withdrawal, fees and accrued interest.

Regenerate:

```bash
pnpm accounting init --fixture seed-1k --out packages/accounting/fixtures/seed-1k.json
```
