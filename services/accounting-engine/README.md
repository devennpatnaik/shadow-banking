# Accounting engine

Maintains the continuously updated ledger of assets, liabilities, cash flows, and transactions, and calculates NAV (fair value of assets − liabilities), net P&L, net annualized yield, returns on equity and deployed capital, financing costs, reserves, drawdown, and liquidation exposure. Separates realized results from projections and never counts borrowed principal or internal transfers as income.

v1 lives in [`packages/accounting`](../../packages/accounting/): double-entry journal, local JSON/JSONL persistence, consolidated performance CLI (`pnpm accounting report`), and a retained-earnings allocator stub (recommendation only). This directory remains the service placeholder for later paper/live operation.
