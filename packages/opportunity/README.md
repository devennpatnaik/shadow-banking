# Opportunity engine

Read-only market-data ingestion (spec §10 / architecture §5.3). Produces dated JSON in the existing [`docs/data/market-snapshot-<date>.json`](../../docs/data/market-snapshot-2026-10-21.json) shape so the strategy engine and simulator can consume a refresh without a schema break.

Phases 1–4 only: **no transactions, no keys, no UI, no risk governor, no paper controller.**

## CLI

```bash
pnpm opportunity refresh --provider fixture --json
pnpm opportunity refresh --out docs/data/market-snapshot-2026-11-09.json
pnpm opportunity show --snapshot docs/data/market-snapshot-2026-10-21.json --json
```

`--json` is accepted on every command (including `help`).

| Command   | What it does                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `refresh` | Merge provider output onto the fixture snapshot and write `--out` (live default: `docs/data/market-snapshot-<UTC-date>.json`) |
| `show`    | Print assets/markets with `source` / `asOf`. Default file is the newest dated snapshot, else the 2026-10-21 fixture           |

`pnpm strategy compare --snapshot <file>` and `pnpm sim run --snapshot <file>` accept the written file. Extra fields (`refresh`, `quality`) are ignored by those parsers (`passthrough`).

## Providers

| Id            | Role                                                                                                      | Network                       |
| ------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `fixture`     | Static copy of `docs/data/market-snapshot-2026-10-21.json`                                                | Never                         |
| `aave`        | Aave v3 GraphQL: Core / Arbitrum / Base supply+borrow APY, LTV, LT, liquidation bonus, eMode              | `AAVE_GRAPHQL_URL` (keyless)  |
| `lst`         | Lido SMA, Rocket Pool APR, Coinbase cbETH APY, Jito stake-pool APY                                        | Keyless HTTP                  |
| `hyperliquid` | Best-effort `metaAndAssetCtxs` + `fundingHistory` for ETH. Fees / planningApr stay on the fixture overlay | Keyless `POST /info`          |
| `gas`         | Optional `eth_gasPrice` **spot only**                                                                     | RPC URL env; skipped if unset |

Live mode **never invents numbers**. If a provider fails, the fixture value is kept with its original `source` and `asOf`, and a degradation is recorded under `refresh.degradations`.

Responses are cached under `.cache/opportunity` (gitignored), TTL 15 minutes.

## Environment

| Variable                | Default                                                          | Notes                                     |
| ----------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| `OPPORTUNITY_PROVIDER`  | `live` locally; `fixture` when `CI=1` or `OPPORTUNITY_OFFLINE=1` | `fixture` \| `live`                       |
| `OPPORTUNITY_OFFLINE`   | unset                                                            | HTTP cache only; miss fails that provider |
| `OPPORTUNITY_CACHE_DIR` | `.cache/opportunity`                                             |                                           |
| `OPPORTUNITY_FIXTURE`   | `docs/data/market-snapshot-2026-10-21.json`                      | Overlay base                              |
| `AAVE_GRAPHQL_URL`      | `https://api.v3.aave.com/graphql`                                |                                           |
| `HYPERLIQUID_INFO_URL`  | `https://api.hyperliquid.xyz/info`                               |                                           |
| `ETHEREUM_RPC_URL`      | unset                                                            | Optional spot gas                         |
| `ARBITRUM_RPC_URL`      | unset                                                            | Optional                                  |
| `BASE_RPC_URL`          | unset                                                            | Optional                                  |

CI must stay green offline: `pnpm opportunity refresh --provider fixture` and unit tests use recorded JSON, not the network.

Aave and Hyperliquid remain **candidates**, not commitments (`docs/integrations.md`).
