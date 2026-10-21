# Do the economics work at ~$1,000? (spec §14, item 10)

**Status:** assessment, dated **2026-10-21**. Every figure below is a **projection** built from the parameter snapshot in [`docs/data/market-snapshot-2026-10-21.json`](data/market-snapshot-2026-10-21.json). Nothing here is a promised, expected, or guaranteed return. Rates move daily; re-snapshot before relying on any number.

---

## 1. Headline conclusion

1. **No candidate strategy clears the 10% net hurdle at $1,000 under current (2026-10-21) rates, and none would clear it at any larger size either.** The binding constraint is not transaction cost or minimum size; it is the yield spread. ETH liquid-staking pays ~2.2%, borrowing ETH on Aave costs ~1.96%, so a recursive loop earns ~0.3 pp of extra return per turn of leverage. Ten turns of leverage (90% LTV, health factor 1.06) would still only project ~4.6% before costs. Aave v3.3's close-factor rule adds a second reason not to lever a $1,000 book: any position with collateral or debt under $2,000 is fully liquidatable in a single call, so a small loop that breaches health factor 1 is closed outright at the cost of the 1–2% bonus on its *entire* debt, and the system has to supply the cushion the protocol does not (§5.3).
2. **Transaction costs at $1,000 are small if the plumbing is chosen correctly.** Ethereum mainnet gas is ~0.04 gwei spot and ~0.37 gwei on a 30-day average, so an entire 3x loop costs ~$3 in gas and swap fees; L2s are cheaper still. The one cost that matters is the **fiat ramp**: buying ETH on Coinbase Advanced costs 0.90% each way (US entry tier since 2026-09-16), i.e. ~$18 round trip, which alone eats most of a year of staking yield. Using the free USD→USDC→Base rails instead costs ~$2 round trip. The platform must use the second path.
3. **The only strategy with a plausible route toward the hurdle is hedged carry** (long wstETH + short ETH-PERP on Hyperliquid): projected **~6.3% net** at the current 30-day average funding (+8.8% APR) and ~4.0% at a 5% planning assumption. It needs funding to average ~15% APR for a year at a 60/40 split (or ~11.6% at a riskier 75/25 split) to reach 10%. Funding was +1.6% on Binance for 2026 year-to-date; it can and does flip negative, at which point the strategy projects a loss.
4. **"Preserve capital in liquid form" is currently the best risk-adjusted option on paper:** USDC supplied to Aave v3 on Base projects ~3.85% with no ETH price exposure, beating hold-LST (~2.0%) and the loop (~2.1%) outright. The system should expect to sit in its no-deployment state for most of the time at a 10% hurdle.
5. **A $1,000 seed is adequate to validate the system, not to earn.** The smallest sensible validation deployment is ~$300 across three legs (a $120 LST hold, a $100 2x loop on Arbitrum, a $100 mini hedged carry), with ~$700 held as USDC. Expected cost to run it for a year: ~$2.20 in one-off costs; expected gross income on the deployed ~$300: ~$12 (plus ~$27 on the USDC reserve). Every minimum-size constraint (Hyperliquid $10 order, 5 USDC deposit) is cleared with room to spare.

---

## 2. The data file and its shape

`docs/data/market-snapshot-2026-10-21.json` is the single source of parameters for this document and is the file the simulator is being built to consume. Shape (all rates are decimals per year; `null` = not captured):

```text
{
  schemaVersion, snapshotDate, currency, hurdle (0.10), conventions{},
  assets[]:  { symbol, network, priceUsd, yieldApy, source, asOf, notes }
  markets[]: { protocol, network, asset, supplyApy, borrowApy, ltv,
               liquidationThreshold, liquidationBonus,
               eMode: null | { category, ltv, liquidationThreshold,
                               liquidationBonus, collateral, borrowable },
               source, asOf, notes }
  costs: {
    gas: { ethereum|arbitrum|base: { gasPriceGwei{spot,avg30d,planning,...},
            actions{ approve|supply|borrow|repay|withdraw|swap|...:
                     { gasUnits?, usdAtPlanning, usdAtSpot?|observedRange? } } } },
    swap: { "wstETH/ETH"|"USDC/ETH": { feeRate, priceImpactAt100, priceImpactAt1000, venues?, source } },
    bridging: { ethereumToL2|l2ToL2|l2ToEthereum: { protocolFeeRate, fixedUsd }, hyperliquid: {...} },
    fiatRamp: { coinbase: { ach/wire/usdc conversion/withdrawal fees, advanced maker/taker rates, simpleBuyFeeRate }, kraken: {...} },
    hyperliquid: { takerFeeRate, makerFeeRate, minOrderNotionalUsd, minDepositUsdc, withdrawalFeeUsdc,
                   ethMaxLeverage, ethMaintenanceMarginRate, funding: { ETH: { currentApr, avg30dApr, planningApr, stressApr, ... } } },
    liquidation: { aaveV3: { defaultCloseFactor (0.5), maxCloseFactor (1.0), fullCloseIfHealthFactorAtOrBelow (0.95),
                             fullCloseIfReserveCollateralOrDebtBelowUsd (2000), minLeftoverAfterPartialLiquidationUsd (1000),
                             appliesTo[], activatedOnAllInstances, borrowerLossOnLiquidation, source, asOf, notes } }
  },
  sourcesIndex[]
}
```

Conventions: `usdAtPlanning` uses a deliberately conservative gas price (~30-day average, 0.40 gwei on mainnet), not the live spot; `priceImpactAt1000` is the modelled impact for a $1,000 ticket; `planningApr`/`stressApr` are the author's modelling assumptions and are labelled as such inside the file. Protocol-level liquidation mechanics that are not per-market parameters (close factor, size thresholds, dust rule) live under `costs.liquidation.<protocol>`; per-market `liquidationThreshold`/`liquidationBonus` stay in `markets[]`, and the borrower's loss on any liquidation is `liquidationBonus × debt repaid`.

---

## 3. Market snapshot (2026-10-21)

| Parameter | Value | As of | Source |
| --- | --- | --- | --- |
| ETH price | $2,445 | 2026-10-21 ~05:00 UTC | [Etherscan](https://etherscan.io/gastracker), [Tindex](https://tindex.app/en/indicators/Cryptocurrency/ETH/) |
| stETH / wstETH yield | **2.22%** APR (7d); 2.24% 30d | 2026-10-21 | [Lido](https://lido.fi/how-lido-works/apr-and-rewards-calculator), [Chartegy](https://chartegy.com/data/series/LIDO_STAKING_RATE) |
| rETH yield | 1.89% APR (7d); 2.06% Oct 1–20 | 2026-10-20 | [Rocket Pool](https://rocketpool.net/liquid-staking/what-can-i-earn), [GrowYourEthereum](https://growyourethereum.com/data/ethereum-staking-apr-history) |
| cbETH yield | 2.32% APY (DefiLlama 2.29%) | 2026-10-21 | [Coinbase](https://www.coinbase.com/earn/staking/coinbase-wrapped-staked-eth), [DefiLlama](https://defillama.com/protocol/coinbase-wrapped-staked-eth) |
| jitoSOL yield (optional) | 4.48% live, 4.78% 30d | 2026-10-20 | [DeFi Garden / DefiLlama](https://www.defi.garden/pools/jito-liquid-staking-jitosol-solana) |
| Aave v3 Ethereum Core WETH borrow | **1.96%** APY; 30d avg 2.00%, 6m 2.26%, 1y 2.32%; spiked to 4.61% on 2026-05-01 | 2026-10-21 02:00 UTC | [Aave Tracker](https://aavetracker.com/markets/ethereum/weth/), [Aavescan](https://aavescan.com/ethereum-v3/weth) |
| Aave v3 Ethereum Core WETH supply | 1.32% | same | same |
| Aave v3 Ethereum Core wstETH | supply 0.00% (+2.22% intrinsic); LTV 78.5 / LT 81 / bonus 6%; **E-mode "ETH correlated": LTV 93 / LT 95 / bonus 1%** | 2026-10-21 05:18 UTC | [Aave Tracker](https://aavetracker.com/markets/ethereum/wsteth/), [Aave dash](https://dash.tools.aave.com/reserve/1-0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2-aave-v3/) |
| Aave v3 Arbitrum WETH | supply 0.94% / borrow **1.97%**; wstETH E-mode 93/95/1 (liquid wstETH/WETH E-mode 94/96/1) | 2026-10-21 02:53 UTC | [Aave Tracker](https://aavetracker.com/markets/arbitrum/weth/), [wstETH](https://aavetracker.com/markets/arbitrum/wsteth/) |
| Aave v3 Base WETH | supply 1.41% / borrow **2.05%**; cbETH & wstETH liquid E-modes 93/95/2 | 2026-10-21 04:16 UTC | [Aave Tracker](https://aavetracker.com/markets/base/), [cbETH](https://aavetracker.com/markets/base/cbeth/), [Aavescan](https://aavescan.com/base-v3/weth) |
| Aave v3 USDC supply | Ethereum 3.23%, Arbitrum 2.32%, **Base 3.86%**; sGHO 4.25% | 2026-10-21 | [app.aave.com](https://app.aave.com/markets/?marketName=proto_mainnet_v3), Aave Tracker |
| Aave v3.3 liquidation close factor | 50% of debt by default; **100% when HF ≤ 0.95 or when the reserve's collateral or debt is below $2,000**; a partial liquidation must leave ≥ $1,000 of both collateral and debt or the call reverts. Active on every Aave v3 instance since 2025-02-24 (proposal 252); unchanged in the current source (v3.7.0, 2026-08-05) | 2026-10-21 | [LiquidationLogic.sol](https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/protocol/libraries/logic/LiquidationLogic.sol), [v3.3 features §2.2–2.3](https://github.com/aave-dao/aave-v3-origin/blob/main/docs/3.3/Aave-v3.3-features.md), [aave.com help](https://aave.com/help/borrowing/liquidations), [BGD activation note](https://governance.aave.com/t/bgd-aave-v3-3-feat-umbrella/20129/7), [releases](https://github.com/aave-dao/aave-v3-origin/releases) |
| Hyperliquid ETH funding | current 10.95% APR (0.00125%/h); **30d avg +8.8%** (high day +17.0%, low day −1.5%, 1 negative day of 30); 7d ~6.3%; realized since 2026-03-17 ≈ 6.3% APR | 2026-10-21 03:17 UTC | [Keel](https://usekeel.io/lab/funding-leaderboard), [Coinliqui](https://coinliqui.com/funding/eth), [Yieldo](https://yieldo.me/funding/eth) |
| ETH funding, Binance (context) | 2026 YTD +1.57% (33% of days negative); 2022 full year +0.79%; 2021–Feb 2026 mean 7.86% | 2026-08/10 | [CryptocurrencyHistory](https://cryptocurrencyhistory.com/coins/eth/funding-rate-history/), [HF dataset](https://huggingface.co/datasets/Torch-Trade/ethusdt_perp_funding_8h_05_2021_to_02_2026), [Fluxy](https://fluxy.io/blog/perp-funding-almanac-2020-2026) |
| Hyperliquid fees / minimums | taker 0.045%, maker 0.015%; **$10 min order**; 5 USDC min deposit; 1 USDC withdrawal; ETH max 25x (2% maintenance) | 2026-10-21 | [HL fees](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees), [HL errors](https://hyperliquid.gitbook.io/Hyperliquid-docs/for-developers/api/error-responses), [HL bridge](https://hyperliquid-co.gitbook.io/wiki/architecture/hypercore/bridge) |
| Ethereum gas | spot 0.039 gwei; 24h 0.22; 7d 0.15; **30d 0.37**; 2026 YTD 0.29; worst day in Oct 0.94 avg / 12.3 peak | 2026-10-21 | [Etherscan](https://etherscan.io/gastracker), [LogicEncoder](https://logicencoder.com/ethereum-gas-price-history/), [GasNow](https://gasnow.tools/gas-history/ethereum.html), [GrowYourEthereum](https://growyourethereum.com/data/ethereum-gas-price-history) |
| L2 gas | Arbitrum native transfer $0.001; Base $0.0003; Aave actions observed $0.005–0.35 | 2026-10-14/20 | [L2 Gas Tracker](https://l2gastracker.com/stats), [OpenChainBench](https://openchainbench.com/compare/arbitrum-vs-base) |
| wstETH/ETH swap depth | Ethereum Uni v3 0.01%: ~1.19K wstETH within 0.10% slippage; Arbitrum 0.01%: ~306 wstETH; Base Uni $95K (thin), Aerodrome 0.009% $4.4M | 2026-10 | [DEXrabbit ETH](https://dexrabbit.bitquery.io/eth/pool/0x109830a1aaad605bbf02a9dfa7b0b92ec2fb7daa), [DEXrabbit Arb](https://dexrabbit.bitquery.io/arbitrum/pool/0x35218a1cbac5bbc3e57fd9bd38219d37571b3537), [LPSignal](https://lpsignal.app/pairs/WETH-wstETH) |
| Bridging | Across mainnet→L2 ~0.06–0.10% + L1 gas; L2→L2 $0.10–0.60 per $500; canonical bridges free but 7-day exit | 2026 | [MultiMesh](https://themultimesh.com/blog/bridge-to-arbitrum) |
| Fiat ramp (Coinbase, US) | ACH free; USD↔USDC 1:1 free; USDC withdrawal to Base/Arbitrum free; **Advanced entry tier 0.50% maker / 0.90% taker** (EU/UK 0.25/0.50); simple buy 1.875% + spread | 2026-09-16 | [Coinbase blog](https://www.coinbase.com/blog/were-lowering-fees-for-many-active-traders-on-coinbase-advanced), [VIP table](https://www.coinbase.com/advanced-vip), [fees](https://help.coinbase.com/en/coinbase/trading-and-funding/pricing-and-fees/fees), [network fees](https://help.coinbase.com/en/international-exchange/trading-deposits-withdrawals/network-fees) |

Two independent corroborations worth recording: Aave's own Risk Stewards wrote in [September 2026](https://governance.aave.com/t/risk-stewards-september-2026-weth-interest-rate-adjustment-on-base/25667) that "a wstETH loop is negative" on Base at a 2.29% borrow rate and that the equivalent loop on Ethereum Core "earns 17 bps per turn of leverage", and that borrowers were unwinding whenever the borrow rate moved above the collateral's yield. Both match the spread this document is built on.

---

## 4. What a $1,000 deployment actually costs

### 4.1 One-off (fixed) costs, round trip

| Path | Entry | Exit | Round trip | Share of $1,000 |
| --- | --- | --- | --- | --- |
| **Cheap USDC rails** (ACH → USDC 1:1 → withdraw to Base free → swap USDC→ETH→wstETH on-chain; reverse) | ~$1.01 | ~$1.01 | **~$2.02** | 0.20% |
| **Default exchange path** (Coinbase Advanced US taker 0.90% → ETH to mainnet → Lido direct mint; DEX swap out → 0.90% sell) | ~$9.63 | ~$9.48 | **~$19.10** | 1.91% |
| Same, resting maker orders (0.50%) | ~$5.63 | ~$5.48 | ~$11.10 | 1.11% |
| Coinbase "simple buy" in the app (1.875% + spread, both ways) | ≥ $18.75 | ≥ $18.75 | **≥ $37.50 + spread** | ≥ 3.75% |

The fiat ramp is the single largest controllable cost at this scale. Everything else is cents:

| On-chain action | Ethereum @ 0.40 gwei (planning) | Ethereum @ 0.039 gwei (spot) | Arbitrum / Base (planning) |
| --- | --- | --- | --- |
| approve | $0.045 | $0.004 | $0.01–0.02 |
| Aave supply | $0.22 | $0.02 | $0.03–0.05 |
| Aave borrow | $0.24 | $0.02 | $0.03–0.05 |
| Aave repay | $0.13 | $0.01 | $0.03–0.05 |
| Aave withdraw | $0.20 | $0.02 | $0.03–0.05 |
| DEX swap (gas only) | $0.18 | $0.02 | $0.005–0.01 |
| Lido stake→wstETH (direct mint) | $0.13 | $0.01 | n/a |
| Full 3x loop, in and out (gas) | **$2.77** | ~$0.27 | **~$0.35** |
| Swap fee + impact, wstETH/ETH, $1,000 ticket | $0.30 (0.01% fee + ~0.02% impact) | same | same (Arbitrum); Base via Aerodrome |
| Hyperliquid open + close $600 short (taker) | $0.54 | | |
| Hyperliquid withdrawal | $1.00 flat | | |
| Across bridge $1,000 mainnet → L2 | ~$0.90 | | L2→L2 ~$0.80 |

Gas units and prices are in the JSON (`costs.gas`). The mainnet tail is real but bounded: on 2026-10-08 intraday gas touched 12.3 gwei, which would price a single Aave borrow at ~$7.20. A system that schedules non-urgent actions and keeps forced actions on L2 avoids this.

### 4.2 Recurring (variable) costs

| Item | Rate | Who pays it in which strategy |
| --- | --- | --- |
| ETH borrow interest | 1.96% (Ethereum Core), 1.97% (Arbitrum), 2.05% (Base) of debt | Loops |
| Perp funding | +8.8% APR 30d avg received by the short; can go negative | Hedged carry |
| Hedge rebalancing | ~4 resizes/yr × 25% of notional × 0.045% ≈ 0.03% of equity | Hedged carry |
| LP loss-vs-rebalancing | ~0.0–0.1% on wstETH/ETH (LPSignal 7d) | LP |
| Protocol fees already netted out of quoted yields | Lido 10%, Rocket Pool ~14%, Coinbase 10%, Aave reserve factor 15% | all |

### 4.3 Minimum-size constraints encountered

| Constraint | Value | Binding at $1,000? |
| --- | --- | --- |
| Hyperliquid minimum order | $10 notional | No (smallest modelled short: $60) |
| Hyperliquid minimum deposit | 5 USDC (smaller deposits are **lost**) | No, but must be hard-coded as a guard |
| Hyperliquid withdrawal fee | 1 USDC flat | Material only for legs < $100 (1%+) |
| Aave supply/borrow minimums | none | No; dust positions (<~$1) can be uneconomic to liquidate, irrelevant here |
| Aave v3.3 partial-liquidation cushion (50% close factor) | requires collateral **and** debt ≥ $2,000 each in the reserve, and HF > 0.95 | **Yes.** Every loop at $1,000 equity up to 3x is below the threshold at entry, so a breach of HF 1 liquidates the whole position in one call (§5.3) |
| Lido stake minimum | none; withdrawal queue 1–5 days | No; DEX exit is instant at 0.01% |
| Across / canonical bridge minimums | none material | No |
| Coinbase ACH | free; small-amount holds apply | No |
| Gas float | ~$3–5 of ETH per chain used | Must be reserved, not a cost |

---

## 5. Strategy economics at $1,000 (projections)

Method, applied uniformly: **net = gross recurring income − borrowing cost − hedging/funding cost − recurring fee drag − (one-off costs ÷ equity) × (12 ÷ months held)**. Base case uses the cheap USDC ramp, planning gas (0.40 gwei mainnet), Ethereum Core rates, wstETH 2.22%, WETH borrow 1.96%, Hyperliquid funding +8.8% (30d average). "Gross" is recurring income on equity before any deduction.

| Strategy | Gross | − Borrow | + Funding | One-off costs | **Net, 12 mo** | **Net, 6 mo** | Clears 10%? | Dominant cost driver |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Preserve capital: USDC on Aave v3 Base | 3.86% | – | – | $0.08 | **+3.85%** | +3.84% | no | none material (stablecoin + protocol risk) |
| Hold wstETH (1x) | 2.22% | – | – | $2.02 | **+2.02%** | +1.82% | no | fiat ramp / entry-exit swaps |
| Loop 2x wstETH/WETH (E-mode) | 4.44% | −1.96% | – | $4.26 | **+2.05%** | +1.63% | no | borrow interest (0.26 pp spread per turn) |
| Loop 3x wstETH/WETH (E-mode) | 6.66% | −3.92% | – | $5.99 | **+2.14%** | +1.54% | no | borrow interest |
| Hedged carry 60/40 (wstETH long + HL short, 1.5x on HL) | 1.33% | – | +5.28% | $2.77 | **+6.31%** | +6.03% | no | funding level and sign; 40% idle margin |
| Hedged carry 60/40 at 5% planning funding | 1.33% | – | +3.00% | $2.77 | +4.03% | +3.75% | no | same |
| Hedged carry 75/25 (3x on HL) | 1.67% | – | +6.60% | $3.21 | +7.91% | +7.59% | no | same; liquidation at ETH +31% |
| LP wstETH/ETH (Curve Arbitrum / Uni 0.01%) | 2.41% | – | – | $2.08 | +2.10% | +1.89% | no | half the capital earns no staking yield |

Per-strategy notes:

- **Hold wstETH.** Position: 1,000 USDC → ~0.33 wstETH. 1x ETH price exposure, no liquidation. Yield has fallen from 4.6% (2022) to 2.2% as staked ETH rose to 43.8M; the trend is down, not up. Net ≈ staking yield minus ramp.
- **Loop 2x / 3x.** Collateral $2,000 / $3,000, debt $1,000 / $2,000 in the 93/95/1 E-mode; health factor 1.90 / 1.43. Because Aave prices wstETH off its stETH exchange rate, liquidation needs a wstETH/ETH oracle move of >47% / >30%, which is not the realistic risk. The realistic risk is **rate spike**: whenever the WETH borrow rate exceeds 2.22% (it averaged 2.32% over the last year and hit 4.61% on 2026-05-01) each turn of leverage *loses* money. Incremental return per turn is 0.26 pp; incremental cost per turn is ~$1.70 one-off plus rate risk, plus 1 pp of equity (2 pp on Base) exposed to a single-call full liquidation under Aave v3.3's close-factor rule (§5.3). The marginal economics stop justifying leverage almost immediately; the optimal stopping point under current rates is 1x–2x, and only because the fixed cost of a turn is tiny.
- **Hedged carry.** $600 wstETH on-chain + $400 USDC margin on Hyperliquid shorting 0.245 ETH-PERP ($600). Net ETH exposure ≈ 0 (basis risk: wstETH/ETH). The short is liquidated if ETH rises ~63% before a rebalance; the controller should top up margin or trim at +25%. Funding is the whole story: at the 30-day average it projects 6.3%; at the 2026 Binance average (+1.6%) it projects ~2.3%; if funding averages −3% it projects −0.8%. Hyperliquid's funding formula includes a 0.01%/8h interest baseline, which is why its 30-day average (8.8%) runs well above Binance's, and why the venue has run ~7 pp richer than Binance since mid-2023 ([Fluxy](https://fluxy.io/blog/perp-funding-almanac-2020-2026)). That premium is also a concentration risk: it depends on one venue with 27 active validators and a 1 USDC withdrawal fee.
- **LP.** A wstETH/ETH pool puts half the capital in unstaked ETH. Fee APRs are small and inconsistent across sources (Curve ETH/wstETH Arbitrum 1.1–1.3% on $100–190K TVL; Uniswap v3 mainnet 0.2% per LPSignal vs 3.25% per DefiLlama-derived pages). Even the generous reading does not reach hold-LST plus a risk premium. Not worth the extra contract and LVR risk at any size; omitted from the validation deployment.
- **jitoSOL (optional second ecosystem).** 4.5–4.8% base yield, double ETH's, with SOL at $105.82. It is the more promising ecosystem for a loop if a Solana lending venue offers SOL borrow well below that, but it is outside the Aave/Hyperliquid scope of this snapshot and is only recorded in `assets[]`.

### 5.1 Leverage ladder (Ethereum Core, wstETH/WETH E-mode, $1,000 equity)

| Leverage | Collateral | Debt | LTV | Health factor | Carry before one-off costs | Net 12 mo @ $1,000 | One-off costs | Aave v3.3 100%-close regime at entry? | Loss if liquidated (1% bonus on entire debt) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1x | $1,000 | $0 | 0% | ∞ | 2.22% | +2.02% | $2.02 | no debt | $0 |
| 1.5x | $1,500 | $500 | 33% | 2.85 | 2.35% | +2.01% | $3.40 | yes (both sides < $2k) | $5 (0.5%) |
| 2x | $2,000 | $1,000 | 50% | 1.90 | 2.48% | +2.05% | $4.26 | yes (debt < $2k) | $10 (1.0%) |
| 3x | $3,000 | $2,000 | 67% | 1.43 | 2.74% | +2.14% | $5.99 | on the threshold; any ETH dip puts it in | $20 (2.0%) |
| 5x | $5,000 | $4,000 | 80% | 1.19 | 3.26% | +2.32% | $9.44 | no, until ETH −50% | $40 (4.0%) |
| 10x | $10,000 | $9,000 | 90% | 1.06 | 4.56% | +2.75% | $18.06 | no, until ETH −78% | $90 (9.0%) |

Formula: carry(k) = y + (k−1)(y−b) with y = 2.22%, b = 1.96%. To reach 10% at 3x the spread would need to be 3.9 pp (a borrow rate of −1.7%); at 10x, 0.86 pp (borrow ≤ 1.36%). Neither has existed on Aave v3 in the period covered by the sources.

The last two columns are the Aave v3.3 close-factor rule (§5.3). Each turn of leverage adds 0.26 pp of carry and 1 pp of equity at risk to a single liquidation call (2 pp on Base), so one full liquidation wipes out **3.8 years** of the extra carry that the leverage was added for (7.7 years on Base), at every rung of the ladder. The HF column is what the system itself must defend: at $1,000 the protocol will not halve the position and let it live, it will close it.

### 5.2 Venue comparison, 3x loop

| Venue / collateral | Gross | Borrow | One-off costs | Net 12 mo |
| --- | --- | --- | --- | --- |
| Ethereum Core, wstETH (1.96%) | 6.66% | −3.92% | $5.99 | +2.14% |
| Arbitrum, wstETH (1.97%) | 6.66% | −3.94% | $3.55 | +2.37% |
| Base, cbETH 2.32% (2.05%) | 6.96% | −4.10% | $3.55 | +2.50% |
| Base, wstETH (2.05%) | 6.66% | −4.10% | $3.55 | +2.21% |

Base currently pays a Merkl incentive of ~2.14% (in USDC) on WETH supply and ~20 bps on the cbETH→WETH borrow campaign. These are excluded on purpose: the spec says not to add a strategy because of an advertised APY, and incentives are withdrawn without notice. Base's E-mode liquidation bonus is also 2% against 1% on Ethereum and Arbitrum, which matters more at this size than the rate difference (§5.3).

### 5.3 What Aave v3.3's close-factor rule means for a ~$1,000 loop

**The rule** (flagged by the architecture worker; verified against [`LiquidationLogic.sol`](https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/protocol/libraries/logic/LiquidationLogic.sol), the [v3.3 feature notes](https://github.com/aave-dao/aave-v3-origin/blob/main/docs/3.3/Aave-v3.3-features.md) and [aave.com](https://aave.com/help/borrowing/liquidations); recorded in the JSON as `costs.liquidation.aaveV3`). Since v3.3 was activated on every Aave v3 instance on 2025-02-24, a liquidator may repay up to 50% of a borrower's debt in one call only if the borrower's collateral **and** debt in the reserve are each ≥ $2,000 (`MIN_BASE_MAX_CLOSE_FACTOR_THRESHOLD = 2000e8`) and HF > 0.95. If either side is below $2,000, the close factor is 100%: the entire debt can be repaid in a single call. A companion rule (`MIN_LEFTOVER_BASE = $1,000`) makes a partial liquidation revert if it would leave less than $1,000 of debt or of collateral, so for any position with debt ≤ $2,000 the only liquidation that can execute is a complete one. BGD's rationale is liquidator economics: at a 1% bonus a $2,000 position pays a $20 reward, which they judged the floor for a liquidation to be worth doing in average gas conditions. The rule is unchanged in the current source (v3.7.0, 2026-08-05).

**Where a $1,000 book sits.** Every loop in §5.1 up to 3x is inside the regime at entry (1.5x and 2x on both sides; 3x has exactly $2,000 of debt, so the first ETH dip puts it in, because the threshold is measured in USD and the debt is ETH-denominated). 5x and 10x start outside it and fall into it after ETH −50% / −78%. For the loop to keep a partial-liquidation cushion through a 50% ETH drawdown, equity would need to be ≥ $4,000 at 2x or ≥ $2,000 at 3x.

**What a liquidation then costs.** The borrower's loss is the liquidation bonus on the debt repaid. With a 100% close factor that is the bonus on the *entire* debt: (k−1) × 1% of equity on Ethereum Core and Arbitrum, (k−1) × 2% on Base, so $10 / $20 at 2x / 3x on mainnet and $20 / $40 on Base, plus $2.24 / $3.97 of gas and swaps to re-establish the loop if the system wants it back. Two ways to read the same number:

- Against the leverage's own payoff: each turn adds 0.26 pp of carry a year and 1 pp (2 pp on Base) of liquidation loss, so a single full liquidation wipes 3.8 years (7.7 on Base) of the extra carry at any leverage. Leverage only pays if the annual probability of a full liquidation is below ~26% on mainnet/Arbitrum and ~13% on Base.
- Against what is left at the moment it happens: in the 95%-LT E-mode, equity at HF = 1 is only 5.3% of debt, so a 1% bonus takes 19% of the remaining equity in one call (38% on Base). A ≥ $2,000 position in the same spot would instead lose 0.5% of debt, be left at HF ≈ 1.04 and keep running at half the leverage; the $1,000 position is simply closed and left holding ~4% of its former debt in wstETH.

**The implied health-factor floor.** Because the protocol's partial-liquidation cushion does not exist below $2,000, the system has to provide it: a higher HF floor at which the governor de-levers by itself, at ~$0.80 per turn (withdraw + swap + repay on mainnet; cents on L2), instead of letting the protocol do it at $10–20 plus re-entry, roughly 15x more. The floor caps leverage directly: with LT 95%, k_max = HF / (HF − 0.95).

| Governor HF floor | Max leverage | Carry at that leverage | Equity lost if the floor is breached and the position is liquidated (1% / 2% bonus) |
| --- | --- | --- | --- |
| 1.05 (typical for ≥ $2k correlated-asset loops) | 10.5x | 4.69% | 9.5% / 19.0% |
| 1.10 | 7.3x | 3.87% | 6.3% / 12.7% |
| 1.25 | 4.2x | 3.04% | 3.2% / 6.3% |
| 1.50 | 2.7x | 2.67% | 1.7% / 3.5% |
| 2.00 | 1.9x | 2.46% | 0.9% / 1.8% |

Modelling assumption for the simulator and for this document: for positions below the $2,000 threshold, hold HF ≥ 1.5 as the target (≤ ~2.7x) and treat HF ≤ 1.25 as a mandatory self-unwind trigger. The carry given up versus running at HF 1.05 is ~2 pp, which at $1,000 is ~$20 a year; the loss avoided is ~$95 per liquidation at 10x. For a wstETH/WETH loop the realistic breach vectors are not price (Aave prices wstETH from its exchange rate) but a sustained borrow rate above the staking yield, a governance change to the E-mode parameters or oracle, or a slashing event; a floor at 1.5 leaves room for all three to be noticed and acted on before the protocol acts.

**Conclusion.** The rule does not change the headline, because the loop was already not worth running for its return. It changes the character of the risk: at $1,000, a loop is an all-or-nothing position, and the leverage ladder's health-factor column is a line the system must defend itself rather than a parameter the protocol will soften. That reinforces the 1x–2x cap, prefers Arbitrum (1% bonus) over Base (2%) for any small loop, and makes an HF floor and self-unwind trigger a required feature of the risk governor, not an optimisation.

---

## 6. Minimum capital at which each strategy clears the hurdle

Net(C) = carry − fixed ÷ C. A strategy clears the hurdle at some finite C only if its carry (variable return before one-off costs) exceeds the hurdle. **None does under current rates**, so the honest answer is "no finite capital", and the useful numbers are the lower thresholds:

| Strategy | Carry (pre-fixed) | Break-even capital (net > 0, 12 mo) | Capital where fixed drag < 0.25 pp/yr | Capital to clear 10% |
| --- | --- | --- | --- | --- |
| Preserve capital (USDC, Aave Base) | 3.86% | $2 | $32 | never (carry < hurdle) |
| Hold wstETH, cheap ramp | 2.22% | $91 | $808 | never |
| Hold wstETH, default ramp ($19.10) | 2.22% | $860 | $7,641 | never |
| Loop 2x, cheap ramp | 2.48% | $172 | $1,704 | never |
| Loop 3x, cheap ramp | 2.74% | $218 | $2,394 | never |
| Loop 3x, default ramp ($23.07) | 2.74% | $842 | $9,227 | never |
| Hedged carry 60/40 @ 8.8% funding | 6.58% | $42 | $1,108 | never |
| Hedged carry 60/40 @ 5% funding | 4.30% | $64 | $1,108 | never |
| Hedged carry 60/40, default ramp ($13.33) | 6.58% | $202 | $5,333 | never |
| Hedged carry 75/25 @ 8.8% funding | 8.23% | $39 | $1,282 | never |
| LP wstETH/ETH | 2.31% | $90 | $832 | never |

What *would* make the hurdle reachable, and the capital that then clears it:

| Condition | Resulting carry | Capital to clear 10% (cheap ramp) |
| --- | --- | --- |
| Funding averages 15.0% APR for a year, hedged carry 60/40 | 10.3% | ~$1,000 (the condition was solved for $1,000) |
| Funding averages 11.6% APR, hedged carry 75/25 (3x on HL, liquidation at ETH +31%) | 10.3% | ~$1,000 |
| Funding averages 10.7% APR, hedged carry 80/20 (4x on HL, liquidation at ETH +23%) | 10.3% | ~$1,000 |
| LST yield 4.6% and ETH borrow 2.0% (2022-like spread), loop 5x | 15.0% | ~$190 |

So the hurdle is a statement about the market regime, not about the seed size. With $1,000 the system is not being held back by its size; it is being told, correctly, that the spread is not there.

---

## 7. Sensitivity (net, 12 months, $1,000, cheap ramp)

| Scenario | Hold wstETH | Loop 2x | Loop 3x | Hedged carry 60/40 (base F = 8.8%) | LP wstETH/ETH |
| --- | --- | --- | --- | --- | --- |
| Base | +2.02% | +2.05% | +2.14% | +6.31% | +2.10% |
| LST yield −2 pp (2.22% → 0.22%) | +0.02% | −1.95% | **−3.86%** | +5.11% | +1.10% |
| Borrow rate +2 pp (1.96% → 3.96%) | +2.02% | +0.05% | **−1.86%** | +6.31% | +2.10% |
| Funding flips negative (sustained −3% APR) | +2.02% | +2.05% | +2.14% | **−0.77%** | +2.10% |
| Gas 3x (1.2 gwei mainnet; 3x L2) | +2.01% | +1.72% | +1.58% | +6.30% | +2.09% |
| Yield −2 pp **and** funding −3% | +0.02% | −1.95% | −3.86% | −1.97% | +1.10% |
| One full Aave liquidation in the year (v3.3 100% close: 1% bonus on entire debt + re-entry) | +2.02% (no debt) | **+0.83%** | **−0.25%** | +6.31% (no Aave debt) | +2.10% (no debt) |
| Same, loop on Base (2% bonus) | – | +0.03% | −1.95% | – | – |

Reading the table: leverage multiplies the downside of both yield compression and rate spikes while adding ~0.1 pp of upside; the hedged carry is insensitive to Aave rates but lives or dies on funding; gas at 3x costs the 3x loop ~0.5 pp at $1,000 and is otherwise noise. The "borrow +2 pp" row is not hypothetical: Aave Core WETH printed 4.61% on 2026-05-01. The liquidation rows are the Aave v3.3 close-factor rule (§5.3): because a sub-$2,000 position is closed in full rather than halved, one liquidation costs the 2x loop 1.2 pp and the 3x loop 2.4 pp (2.1 / 4.2 pp on Base), which is roughly the loop's whole year of carry. The hedged carry's short on Hyperliquid has its own liquidation mechanics (§5), not covered by this rule.

Portfolio view with the spec's 20% liquidity reserve in USDC on Aave Base: hold wstETH → +2.39%; loop 3x → +2.43%; hedged carry 60/40 → +5.80%.

---

## 8. What is and is not realistic at $1,000

**Realistic**

- Running every strategy mechanically. Costs are in the low single dollars per year if the fiat ramp is the USDC path and actions are on L2 (or on mainnet during the sub-gwei regime that has held since August 2025).
- Clearing every minimum-size constraint with a wide margin.
- Earning roughly **$20–65 per year** gross across the candidate strategies (2–6.5%), i.e. enough to measure accounting and execution correctness, not enough to matter financially.
- Learning more from the $1,000 than it earns: the value of the seed is the validation of ledger, risk governor, unwind and hedge plumbing.

**Not realistic**

- Any path to **10% net** under current rates, at any size, without taking on funding-rate risk at 3–4x margin leverage on a single perp venue.
- Treating leverage as the lever. The wstETH/ETH spread is ~0.26 pp per turn; each turn adds rate-spike and liquidation exposure for ~$1 of extra expected income per year on $1,000.
- Relying on Aave's partial-liquidation cushion. Below $2,000 of collateral or debt there is none (§5.3): a breach closes the whole loop at 1–2% of its entire debt, so the health-factor floor and the self-unwind trigger have to live in this system's risk governor.
- Buying and selling through an exchange order book at retail tiers. A 0.90% taker fee each way is ~$18 round trip and turns a +2.0% hold-LST year into +0.3%.
- Counting incentives (Merkl, points, airdrops) or venue-specific funding premia as durable yield.

**What "preserve capital in liquid form" looks like for this account**

$1,000 as USDC, supplied to Aave v3 on Base (3.86% projected; Ethereum Core 3.23%; sGHO 4.25%), or simply held at Coinbase (0% unless on Coinbase One, which pays 3.5% on USDC). On-chain one-off cost: ~$0.08. Withdrawable within one block; no ETH price exposure; residual risks are USDC issuer/depeg and Aave contract risk. On current numbers this option out-earns hold-LST and the loop with less risk, so a correctly functioning controller at a 10% hurdle should report "no deployment; reserve earning ~3.9%" as its normal state. That is a feature of the design, not a failure of the seed. A hurdle expressed relative to the stablecoin lending rate plus a risk premium (rather than a flat 10%) would make the comparison explicit; this is a suggestion for the spec owner, not a change made here.

**Smallest sensible validation deployment (recommended for Phase 6 planning)**

~$300 deployed, ~$700 in USDC reserve, all funded through the free USD→USDC→Base rails:

| Leg | Size | Purpose | One-off cost | Projected carry | Checks |
| --- | --- | --- | --- | --- | --- |
| Hold wstETH, supplied to Aave Base as collateral (no borrow) | $120 | supply / withdraw / accounting / oracle | $0.26 | $2.66/yr | — |
| Loop 2x wstETH/WETH on **Arbitrum** (1% E-mode bonus; Base's is 2%) | $100 equity ($200 collateral, $100 debt) | borrow / repay / health-factor monitoring / governor self-unwind trigger | $0.62 | $2.47/yr | HF 1.90; cannot be liquidated by price alone; **fully liquidatable in one call** under Aave v3.3 (both sides < $2k): loss on breach $1.00 + $0.26 re-entry; governor unwinds at HF ≤ 1.25 |
| Mini hedged carry: $60 wstETH + $40 USDC on Hyperliquid, short $60 ETH-PERP | $100 | HL API, funding accrual, margin monitoring, hedge unwind | $1.20 (incl. the $1 withdrawal) | $6.58/yr at 8.8% funding | $60 ≥ $10 min order; $40 ≥ 5 USDC min deposit; liquidation at ETH +63% |
| USDC reserve on Aave Base | $700 | reserve accounting, redeploy logic | $0.08 | $27.02/yr | — |
| **Total** | **$1,000** | | **~$2.16** | **~$38.7/yr (≈3.9%)** | |

This exercises every code path the later phases need (supply, borrow, repay, withdraw, swap, hedge open/resize/close, bridge, reserve management, and the HF-floor self-unwind path that §5.3 makes mandatory for small positions) for about $2.20 of unrecoverable cost, with bounded downside (a 2x loop and a 1.5x hedge cannot be liquidated by ordinary volatility, and the worst case on the loop leg is a $1.26 all-in loss) and real, auditable cash flows in the ledger. The loop leg is placed on Arbitrum rather than Base because, now that any breach closes the whole leg, the 1% versus 2% liquidation bonus matters more than the 8 bps of borrow-rate difference.

---

## 9. Assumptions, exclusions, and how to reproduce

Assumptions (all recorded in the JSON):

- Rates are held constant for the horizon (6 or 12 months). They will not be; see §7.
- wstETH trades at parity with stETH, and stETH with ETH, except for the modelled swap costs. Aave prices wstETH from its exchange rate, so loop liquidation risk is oracle/rate-driven, not market-driven.
- Mainnet gas at 0.40 gwei "planning" (≈30-day average); L2 actions at $0.01–0.05; ETH at $2,445 for all gas conversions.
- Loop turns executed as borrow → swap → supply (three transactions) each way. A flash-loan one-shot is cheaper and is not assumed.
- Swap costs: wstETH/ETH 0.01% fee + 0.02% impact at $1,000; USDC/ETH 0.05% fee + 0.02% impact. Lido direct mint (0 fee) is used on the mainnet default-ramp path.
- Hedged carry margin leg funded with USDC straight from Coinbase (free), deposited to Hyperliquid from Arbitrum; four 25% resizes per year as taker; 1 USDC exit fee.
- Funding received by the short at the 30-day average (+8.8% APR) in the base case, +5% "planning" and −3% "stress" elsewhere; Hyperliquid's own 10.95% baseline is deliberately not used as the base case.
- Liquidity reserve not deducted inside strategy rows; the 20% portfolio view is shown separately.
- No compounding within the year; income is simple.
- Liquidations are not priced into the base case (their probability is not estimated here); the §7 rows show the cost of one event. A liquidation of a sub-$2,000 Aave position is modelled as a 100% close under the v3.3 rule: loss = E-mode liquidation bonus (1% Ethereum/Arbitrum, 2% Base) × entire debt, plus the gas and swaps to re-establish the loop. The governor HF floor of 1.5 (target) / 1.25 (self-unwind) for small positions is this document's modelling assumption, not a protocol parameter.

Excluded on purpose: taxes (jurisdiction-specific; spec §8 lists them as a later feature), protocol incentives and points, airdrop speculation, stablecoin depeg or smart-contract loss expectancies (listed as risks, not priced), Coinbase One subscription economics, and any strategy relying on speed or MEV.

Reproduction: every table above is `carry − fixed/equity × 12/months` using the fields in `docs/data/market-snapshot-2026-10-21.json`; the per-strategy fixed-cost build-ups are itemised in §4, the leverage formula in §5.1, and the liquidation arithmetic (`loss = liquidationBonus × debt`, `k_max = HF / (HF − LT)`) in §5.3 using `costs.liquidation.aaveV3` and the E-mode parameters in `markets[]`. The simulator worker is wiring the same file as input, so the numbers here should be reproducible there to the cent once that lands.

---

*This is software documentation, not financial advice. Capital deployed in any of the strategies above can be lost through smart-contract failure, liquidation, funding reversals, stablecoin failure, venue or bridge failure, or oracle error. Nothing in this document promises or projects a return to any user.*
