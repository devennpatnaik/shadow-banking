# Portfolio controller

Determines allocations, liquidity reserves, debt repayment, and how retained earnings are compounded (repay debt, add collateral, acquire yield-bearing assets, raise reserves, fund upcoming expenses). Recalculates after every material change in NAV or market conditions and can retain earnings in liquid form when reinvestment is unattractive.

Phase 4 paper implementation: [`packages/controller`](../../packages/controller). CLI: `pnpm paper run` / `pnpm sb paper`. No live execution.
