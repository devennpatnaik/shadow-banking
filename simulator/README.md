# Simulator

Recursive collateralized-borrowing simulator (spec §3, §4C). It models:

**equity → productive collateral → borrow → more collateral → …**

and stops when the _marginal_ estimated net economics or the risk limits turn unattractive. It does not send transactions, hold keys, or fetch live market data. Every APY, ROE, and “net yield” it prints is an **estimate** at a dated snapshot, not a realized result and not a promised return.

The default evaluation hurdle is **10% annualized net**, configurable (`--hurdle`). If nothing clears it, the recommendation is to hold the seed in liquid form.

## Run

From the repo root (after `pnpm install`):

```bash
pnpm sim presets
pnpm sim run --preset aave-v3-ethereum-wsteth-eth-emode --seed 1000
pnpm sim run --preset aave-v3-arbitrum-wsteth-eth-emode --seed 1000 --format json
pnpm sim compare --seed 1000
pnpm sim stress --preset aave-v3-ethereum-wsteth-eth-emode --seed 1000
```

`--loops` is `optimal` (default), a non-negative integer, or `ltv:0.80`. `--reserve` defaults to `0.2`. `--horizon` is in days (default 365) and is the window over which one-off gas/swap/unwind costs are amortized.

## Presets (dated snapshots)

| id                                  | Ecosystem                                  | Snapshot   |
| ----------------------------------- | ------------------------------------------ | ---------- |
| `aave-v3-ethereum-wsteth-eth-emode` | Aave v3 Core wstETH/ETH E-mode, Ethereum   | 2026-10-21 |
| `aave-v3-arbitrum-wsteth-eth-emode` | Aave v3 wstETH/ETH liquid E-mode, Arbitrum | 2026-10-21 |
| `aave-v3-base-wsteth-eth-emode`     | Aave v3 wstETH/ETH liquid E-mode, Base     | 2026-10-21 |
| `kamino-solana-jitosol-sol`         | Optional Solana LST loop (partial data)    | 2026-10-21 |

Sources are recorded on each preset (Lido APR, aavetracker, Aave E-mode pages, etherscan / l2gastracker). Relative wstETH/ETH volatility (8%) is an **assumption**, not a fitted estimator.

## External parameter file

The loader accepts `docs/data/market-snapshot-<date>.json` (another worker produces it). Schema — extra fields ignored, `null` means “not captured”:

```json
{
  "schemaVersion": 1,
  "snapshotDate": "2026-10-21",
  "currency": "USD",
  "hurdle": 0.1,
  "assets": [
    {
      "symbol": "wstETH",
      "network": "ethereum",
      "priceUsd": 3034.78,
      "yieldApy": 0.0222,
      "source": "…",
      "asOf": "2026-10-21"
    }
  ],
  "markets": [
    {
      "protocol": "aave-v3-core",
      "network": "ethereum",
      "asset": "wstETH",
      "supplyApy": 0.0,
      "borrowApy": 0.0003,
      "ltv": 0.785,
      "liquidationThreshold": 0.81,
      "liquidationBonus": 0.06,
      "eMode": {
        "category": "ETH correlated (id 1)",
        "ltv": 0.93,
        "liquidationThreshold": 0.95,
        "liquidationBonus": 0.01,
        "collateral": true,
        "borrowable": false
      }
    }
  ],
  "costs": {
    "gas": {
      "ethereum": {
        "ethPriceUsd": 2445.37,
        "gasPriceGwei": { "planning": 0.4, "spot": 0.039 },
        "actions": {
          "approve": { "gasUnits": 46000, "usdAtPlanning": 0.045 },
          "supply": { "usdAtPlanning": 0.215 },
          "borrow": { "usdAtPlanning": 0.235 },
          "swap": { "usdAtPlanning": 0.176 },
          "setEMode": { "usdAtPlanning": 0.059 }
        }
      }
    },
    "swap": { "wstETH/ETH": { "feeRate": 0.0001, "priceImpactAt1000": 0.0002 } },
    "bridging": { "ethereumToL2": { "protocolFeeRate": 0.0008, "fixedUsd": 0.11 } },
    "fiatRamp": {},
    "hyperliquid": {}
  }
}
```

Rates are **decimal fractions per year** (`0.0222` = 2.22%). Gas: prefer `usdAtPlanning` per action; otherwise `gasUnits × planningGwei × 1e-9 × ethPriceUsd`.

```bash
pnpm sim run --snapshot docs/data/market-snapshot-2026-10-21.json --network ethereum --collateral wstETH --borrow WETH --seed 1000
```

If the file is present at that path, `pnpm sim run` without `--preset` will also pick it up.

## Risk outputs (Aave v3.3)

Each step reports:

- health factor, price-drop-to-liquidation (`1 − 1/HF`)
- `smallPosition` — collateral **or** debt below `$2,000` (configurable `market.smallPositionUsd`)
- `closeFactorAtLiquidation` — 100% when small, else 50% (or 100% if HF `< 0.95`)
- `fullyLiquidatableInOneCall`
- `effectiveMinHealthFactor` — Normal floor + post-action buffer + **+0.10 when small**

A $1,000 seed is always in the small-position regime until the book grows past $2,000 of _both_ collateral and debt.

## $1,000 mainnet vs L2 (example)

`pnpm sim compare --seed 1000` (2026-10-21 snapshot, 20% reserve, 365-day amortization, **estimates**):

| Venue    | Setup costs | Costs after 1 forced loop | Estimated net yield on seed (optimal) |
| -------- | ----------: | ------------------------: | ------------------------------------: |
| Ethereum |       $0.56 |                     $1.41 |                   2.49% → hold liquid |
| Arbitrum |       $0.33 |                     $0.67 |                   2.51% → hold liquid |
| Base     |       $0.29 |                     $0.58 |                   2.52% → hold liquid |

Carry is ~0.26 pp (2.22% wstETH − 1.96% WETH borrow) before costs. The L2 is cheaper, but at $1,000 the spread is still far below the 10% hurdle, so extra loops are rejected on every venue. Re-run the command if the snapshot changes.

## Tests

`pnpm test` covers loop identities, the stopping rule, snapshot-schema loading, and the small-position close factor. No network calls.
