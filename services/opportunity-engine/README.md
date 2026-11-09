# Opportunity engine

Collects current yield, borrowing-rate, funding-rate, liquidity, and risk data from protocols and venues. Feeds verifiable market data to the strategy engine and risk governor; does not make allocation decisions.

Implementation (Phase 1–4, read-only CLI): [`packages/opportunity`](../../packages/opportunity/README.md).

```bash
pnpm opportunity refresh --provider fixture --json
pnpm opportunity show --json
```
