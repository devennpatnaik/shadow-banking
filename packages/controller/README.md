# `@shadow-banking/controller`

Phase 4 **paper** portfolio controller: load a market snapshot, evaluate strategies, ask the risk governor, and apply only **approved** actions to a hypothetical accounting ledger.

There is no signer and no live execution. Vetoed intents are never posted.

```bash
pnpm paper run --steps 7 --seed 1000 --snapshot docs/data/market-snapshot-2026-10-21.json
pnpm paper run --steps 7 --seed 1000 --json
pnpm sb paper run --steps 7 --seed 1000 --json
```

At the default 10% annualized net hurdle and a $1,000 seed, the fixture book **holds liquid**.
