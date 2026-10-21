# Integrations inventory: accounts, protocols, APIs, SDKs, and MCP servers

Spec deliverable §14.2. Research performed on **2026-10-21** with web search; every factual claim about an external service cites a numbered source in [§6](#6-sources) with the date it was checked. Limits, prices, and parameters change frequently; treat the numbers as a snapshot to be re-verified before each phase gate.

Posture: every protocol below is a **candidate to evaluate, not a commitment**. Aave and Hyperliquid are the first candidates because they are the most liquid venues for, respectively, collateralized borrowing and perpetual hedging; the simulator (Phase 2) and the ~$1k economics assessment (`economics-1k.md`, a separate deliverable) decide whether either is used at all.

Phase numbers refer to spec §13 (1 read-only model, 2 simulator, 3 opportunity & risk engine, 4 paper, 5 assisted execution, 6 limited automation, 7 broader management).

---

## 1. Summary matrix

Read/write column: **R** = read-only data, **W** = can move value or change positions, **Wx** = write capability exists but must be constrained (see §3.11).

| # | Integration | Role in the platform | R/W | Auth model | Limits (free / entry tier) | Networks | First phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Plaid (Balance, Transactions, Investments, Liabilities) | Bank, brokerage, loan, and some exchange account ingestion | R | OAuth-style Link flow → `access_token`; `client_id` + `secret` server-side | Limited Production: 200 live calls per product free; Production per-Item limits e.g. Balance 5/min, Investments holdings 15/min, Liabilities 30/min [31][32] | US/CA (+ EU/UK custom) | 1 |
| 2 | Teller | Low-cost US bank ingestion (no investments) | R | Teller Connect enrollment + mutual-TLS client certificate on every call [36][37] | Developer tier free up to 100 live connections [36] | US only | 1 (alternative to Plaid) |
| 3 | MX Platform API | Enterprise aggregation alternative | R | Connect widget, sales-led onboarding, no public pricing [37] | Not published | US/CA | Deferred |
| 4 | SimpleFIN Bridge | Minimal read-only personal-finance feed | R | Per-user setup token | $15/yr per user, read-only [38] | US | 1 (fallback) |
| 5 | EVM JSON-RPC (Alchemy / Infura / QuickNode / public) | Wallet balances, contract reads, tx submission, `eth_simulateV1` | R + W (submit) | API key per provider; public endpoints keyless | Alchemy Free 30M CU/mo, 300 CU/s; Infura Core 3M credits/day; QuickNode 1-month trial then paid [39][46] | Ethereum, Arbitrum, Base, Optimism, Polygon, many L2s | 1 (read), 5 (write) |
| 6 | Alchemy Portfolio API (Tokens by Wallet) | Multichain wallet balance ingestion with prices | R | API key | Shares the CU budget above; partial-failure semantics per network [40] | Ethereum, Solana, 30+ EVM chains | 1 |
| 7 | Zerion API | Normalised DeFi positions across protocols (cross-check) | R | API key | Developer: 2k req/day, 3 RPS; DeFi-position endpoints capped at 25% of quota [44] | 40+ chains | 4 (optional) |
| 8 | Etherscan API v2 | Tx history, verified ABIs, cross-check | R | API key, `chainid` param | Free: 3 calls/s, 100k/day, selected chains [45] | 60+ chains | 1 |
| 9 | Aave v3 Pool contracts | Supply, borrow, repay, withdraw, E-mode, flash loans | W | Wallet signature (EOA or smart account) | On-chain: supply/borrow caps per reserve; gas | 21 networks incl. Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche [12] | 2 (params), 5 (write) |
| 10 | Aave view contracts (`UiPoolDataProvider`, `AaveProtocolDataProvider`, `AaveOracle`) | Reserve parameters, E-mode categories, user positions, protocol prices | R | None (RPC) | RPC limits only [4] | All Aave v3 networks | 1 |
| 11 | Aave address book (`@aave-dao/aave-address-book`, JSON API) | Canonical contract addresses | R | None | Static JSON, versioned [3] | All | 1 |
| 12 | AaveKit TypeScript SDK (`@aave/client`) + GraphQL API (`api.v3.aave.com/graphql`) | Markets, reserves, user positions, rate history, tx building | R (+ tx building) | None for reads; wallet for sending | Shared public API, no published quotas [1][2] | All Aave v3 (and v4) markets | 1 |
| 13 | Aave subgraphs (The Graph) | Historical events for backtests | R | The Graph API key | Query-fee based | Per network | 3 |
| 14 | Hyperliquid Info API (`POST /info`) + WebSocket | Perp/spot metadata, mark/oracle prices, funding, order book, account state | R | None (public) | 1200 weight/min per IP; most info calls weight 20, `l2Book`/`clearinghouseState` weight 2; WS 10 connections, 1000 subscriptions [18] | Hyperliquid L1 (HyperCore); mainnet + testnet | 2 (data), 4 (live) |
| 15 | Hyperliquid Exchange API (`POST /exchange`) | Orders, cancels, leverage, margin, transfers | W | EIP-712 signed actions by master or API/agent wallet; agent wallets trade-only [17][25][61] | Exchange actions weight 1; address-based limit 1 request per 1 USDC traded with 10k initial buffer; min order $10 [17][18] | HyperCore | 5 |
| 16 | Hyperliquid SDKs | Typed clients and signing | R/W | As above | Official Python SDK; community TypeScript (`@nktkas/hyperliquid` v0.33.3, Aug 2026); official Rust SDK not actively maintained; CCXT [15][26][27][28] | — | 2 |
| 17 | Lido (stETH, wstETH, `WithdrawalQueueERC721`, `@lidofinance/lido-ethereum-sdk`) | Yield-bearing collateral; primary redemption | W | Wallet signature | Withdrawal requests 100 wei–1000 stETH each, async finalization, cannot be cancelled [48]; SDK built on viem [49] | Ethereum; wstETH bridged to Arbitrum/Base/Optimism/Polygon | 2 (data), 5 (write) |
| 18 | Rocket Pool rETH | Alternative ETH LST collateral | W | Wallet signature | Direct burn to ETH when deposit-pool liquidity exists, otherwise secondary market [52]; ~1.89% 7-day APR shown 2026-10-21 [51] | Ethereum (bridged variants on L2s) | 2 (data) |
| 19 | Coinbase cbETH | Custodial-issuer LST collateral | W (secondary market); mint/redeem via Coinbase account | Wallet signature; Coinbase account for primary | Priced on Aave via CAPO exchange-rate feed [14] | Ethereum, Base | 2 (data) |
| 20 | Solana LSTs (jitoSOL, mSOL) — optional | Second asset ecosystem for the simulator | R (Phase 2) | Solana wallet | Not accepted on Aave; requires a Solana lending venue and a separate RPC/SDK stack | Solana | 2 (data only) |
| 21 | Uniswap v4 / v3 (Universal Router, `@uniswap/v4-sdk`, `@uniswap/universal-router-sdk`, PositionManager) — optional | Swaps for entering/unwinding; optional LP strategy | W | Wallet signature; Permit2 approvals | Gas + slippage; no API quota for on-chain use [56] | Ethereum, Arbitrum, Base, Optimism, Polygon, others | 5 (swaps), 7 (LP) |
| 22 | Chainlink Data Feeds (`AggregatorV3Interface`) | Independent price sanity check, L2 sequencer uptime | R | None (RPC) | Heartbeat/deviation update model; staleness must be checked [54] | Ethereum and major L2s | 1 |
| 23 | Chainlink Data Streams | Low-latency pull prices (not needed initially) | R | Self-serve API credentials, HMAC [54] | Plan-based | Multi-chain | Deferred |
| 24 | DefiLlama API | Cross-protocol yields, borrow rates, LST rates, TVL, perps funding | R | Free endpoints keyless; Pro key in URL path | Free `api.llama.fi` and `/pools`; Pro ≈ $250–300/mo, 1M calls/mo, adds `/yields/poolsBorrow`, `/yields/lsdRates`, `/yields/perps` [58] | Aggregate | 3 |
| 25 | CoinGecko API | Prices, market history, cross-check | R | Demo API key (free) | Demo: 10k calls/mo, 100/min, attribution required [57] | Aggregate | 1 |
| 26 | Transaction simulation: local fork (Foundry `anvil`), `eth_simulateV1`, `debug_traceCall` | Mandatory pre-sign simulation | R | RPC key | `eth_simulateV1` = 40 CU on Alchemy; Alchemy's proprietary simulate APIs were deprecated 2026-09-30 [41][42] | Any EVM | 4 |
| 27 | Tenderly Simulation API / Virtual TestNets | Richer simulation, decoded traces, CI forks | R | Access token; **paid plan required for API and MCP** [47] | Not published; sales-led | 100+ EVM networks | Optional, 5 |
| 28 | Signer & policy: Safe + Zodiac Roles Modifier v2, or hosted KMS policy engine (Turnkey-style) | Allowlists, spending limits, call-rate limits for the hot key | Wx | Owner key configures; agent key executes under role | Roles v2 mastercopy 2.1.1 only (2.1.0 has a known vulnerability) [60] | EVM | 5 |
| 29 | Fiat on/off-ramp (e.g., Coinbase via CDP / Advanced Trade) | Move seed capital fiat ↔ USDC ↔ L2 | W | API key + OAuth; KYC'd account | Exchange-specific | — | 5 |

---

## 2. Account integrations (read-only)

### 2.1 Bank and brokerage aggregation

**Plaid** is the broadest option: Balance, Transactions, Liabilities (loans, credit cards, mortgages → feeds "existing debts and interest rates" in §2B), and Investments, whose coverage includes brokerages, retirement providers, and some crypto exchanges [33]. Auth is the Link flow (user authenticates at the institution or via OAuth; the platform receives a `public_token` and exchanges it for an `access_token`); server calls carry `client_id` and `secret` [34]. Production rate limits are per-Item and fixed-window: `/accounts/balance/get` 5/min and 30/hour per Item, `/investments/holdings/get` 15/min, `/liabilities/get` 30/min, `/transactions/*` 30/min [32]. Free "Limited Production" allows 200 live calls per product; beyond that it is pay-as-you-go per connected account or per request [31]. Official SDKs include `plaid-node` (generated from OpenAPI, API version 2020-09-14) [34].

**Teller** is cheaper and self-serve (free developer tier with 100 live connections) and returns balances, transactions, identity, and verified ACH details, but does not cover investments or crypto, is US-only, and requires a mutual-TLS client certificate on every request [36][37]. Good fit for a personal, single-user deployment whose brokerage data can be entered manually.

**MX** is sales-led with no public pricing or free tier; defer unless enterprise coverage is needed [37]. **SimpleFIN** ($15/year, read-only) is a viable personal fallback [38]. In the US, bank data-access fees introduced in 2026 can change aggregator costs for specific institutions [38].

Design consequences:

- Aggregators give balances and holdings, not control; this is the desired default (§2A). They never enter the execution plane.
- Balance freshness is minutes-to-hours and rate-limited per Item; the balance-sheet engine must carry `asOf` per account and must not poll `/accounts/balance/get` more than its per-Item limit.
- Brokerage holdings matter for the consolidated balance sheet and risk (concentration, reserves) even though they are observed-only.

### 2.2 Wallet read access

Self-custody wallet balances and positions are read without any credential:

- **Direct RPC reads** with `viem` multicall for native and ERC-20 balances, Aave `UiPoolDataProvider.getUserReservesData`, LST exchange rates, and Chainlink feeds. Cheapest and most trustworthy; depends on RPC quotas (§3.9).
- **Alchemy Portfolio API** (`/data/v1/{apiKey}/assets/tokens/by-address`) returns balances, metadata, and prices across Ethereum, Solana, and 30+ EVM chains in one call, with per-network partial-failure reporting [40]. Useful for discovery of unknown holdings in observed wallets.
- **Zerion** normalises DeFi positions (staking, lending, LP) across 40+ chains; free tier is 2k requests/day at 3 RPS with position endpoints capped at 25% of quota [44]. A cross-check, not a system of record.
- **Etherscan v2** unified API for transaction history and verified ABIs; free tier 3 calls/s, 100k/day [45].
- **Hyperliquid account state** is read from the public Info endpoint using the master account address (not the agent wallet address) [16].

Rule: positions the platform manages are always read from the protocol itself (contract or venue API), never only from an indexer; indexers are used for discovery and reconciliation.

---

## 3. Protocol and infrastructure integrations

### 3.1 Aave v3 (lending market candidate)

**Interfaces.**

- Contracts: `Pool` (supply/borrow/repay/withdraw/setUserEMode/flashLoan), `PoolAddressesProvider`, `AaveOracle`, `UiPoolDataProvider` (`getReservesData`, `getUserReservesData`, `getEModes`), `UiIncentiveDataProviderV3` [4]. Addresses from `@aave-dao/aave-address-book` (npm, Foundry, and a static JSON API with manifest/commit for verification) [3].
- SDK: **AaveKit** `@aave/client` (TypeScript, viem/ethers v6 compatible) wraps the GraphQL API and builds transactions; `aave-utilities` is deprecated [1].
- API: GraphQL at `https://api.v3.aave.com/graphql` for chains, markets, reserves, user positions, and historical rates; also usable as a playground [2].
- Subgraphs on The Graph for event-level history (backtests), keyed access.

**E-mode.** Categories are market-specific and read on-chain via `getEModes` (LTV, liquidation threshold, liquidation bonus, collateral and borrowable bitmaps) [4]. Since v3.2 ("Liquid eModes") an asset can belong to multiple E-modes, and v3.6 added E-mode-exclusive collateral/borrow configurations [10]. The ETH-correlated category on Ethereum Core historically moved from 90/93 to 93/95 LTV/LT with a 1% liquidation bonus [53]; current values must be read live, not hard-coded.

**Liquidation rules that matter at seed scale (v3.3+).** Health factor = Σ(collateral × liquidation threshold) ÷ debt. When HF < 1 a liquidator may repay up to 50% of debt **only if HF > 0.95 and both collateral and debt are ≥ $2,000**; otherwise up to **100%** may be liquidated, and partial liquidations may not leave less than $1,000 of collateral or debt [5][6][7]. A ~$1k position is therefore always fully liquidatable in a single transaction once HF < 1. This is a primary input to `risk-governor.md` and to the economics assessment.

**Networks.** As of 2026-10-21 Aave v3 runs 24 markets on 21 networks, including Ethereum (Core, Prime, EtherFi, Horizon), Arbitrum, Base, Optimism, Polygon, Avalanche, BNB Chain, Gnosis, Scroll, Linea, zkSync Era, Sonic, Celo, Soneium, Plasma, Mantle, Metis, Ink, X Layer, MegaETH, and Monad [12]. zkSync, Metis, and Soneium were proposed for wind-down in a November 2025 temp check [13]; avoid them. For a $1k deployment the realistic choices are Arbitrum or Base (low gas, $0.9B+ supplied each) with Ethereum Core as the deep-liquidity reference [12].

**Aave v4.** Live on Ethereum mainnet since 2026-03-30 with a Hub-and-Spoke architecture (Core/Prime/Plus hubs, 11 spokes including Lido and EtherFi e-spokes), conservative caps, and later deployments on Avalanche and Base [8][9][10]. v3 keeps running alongside; there is no forced migration. AaveKit, the GraphQL API, and the MCP server cover both versions [11]. Plan: model v3 first (mature, multi-L2), keep the simulator parameterised so v4 spokes can be evaluated once caps and liquidity mature.

**Umbrella.** Aave's current safety module stakes aTokens/underlying to cover bad debt automatically [10]. Relevant as a protocol-insolvency mitigation to monitor, not as a yield source for this product initially.

**Phase need.** Parameters and rates: Phase 1–2. Live reads of user positions: Phase 4. Writes: Phase 5.

### 3.2 Hyperliquid (perpetual hedging candidate)

**Interfaces.**

- `POST https://api.hyperliquid.xyz/info` for metadata (`meta`, `spotMeta`, margin tables), `allMids`, `l2Book`, `clearinghouseState`, `fundingHistory`, `predictedFundings`, `userFees`, `userRateLimit`; responses paginate at 500 items [16]. Testnet at `api.hyperliquid-testnet.xyz` [15].
- `POST https://api.hyperliquid.xyz/exchange` for signed actions: orders (limit with `Alo`/`Ioc`/`Gtc`, trigger TP/SL, `reduceOnly`, client order ids, optional builder fee), cancels, leverage/margin mode, isolated-margin adjustments, transfers, `approveAgent` [17].
- WebSocket for real-time book, trades, fills, and account updates; up to 10 connections and 1000 subscriptions per IP [18].
- SDKs: official Python SDK (`hyperliquid-python-sdk`, MIT) [26]; community TypeScript SDKs `@nktkas/hyperliquid` (v0.33.3, updated 2026-08-02, ~108k weekly downloads, viem/ethers wallet integration) and `nomeida/hyperliquid`, both listed in the official docs [15][27]; official Rust SDK exists but is described as not actively maintained, with a community alternative [15][28]; CCXT integration [15].

**Permissions.** Actions are signed EIP-712 messages. A master wallet can `approveAgent` an **API (agent) wallet** that can trade but **cannot withdraw, transfer out, or approve other agents**; named agents can carry a `valid_until` expiry of at most 180 days; nonces are tracked per signer and pruned when an agent is deregistered, so agent addresses must not be reused [17][25][61]. This is exactly the venue-side permission boundary the architecture requires (`architecture.md` §4).

**Limits and costs (2026-10-21).**

- IP limit 1200 weight/min; exchange actions weight 1 + floor(batch/40); address-based limit of 1 action per 1 USDC traded cumulatively, with a 10,000-action starting buffer, and one action per 10 s when exhausted (cancels get extra headroom) [18].
- Minimum order value **$10** [17]. Maximum market-order value depends on asset leverage tier (e.g., $30M at ≥25x) [24].
- Fees, base tier (≤ $5M 14-day weighted volume): perps 0.045% taker / 0.015% maker; spot 0.070% / 0.040%; HYPE staking discounts 5–40%; optional builder fee up to 0.1% on perps [19][20].
- Margin: cross by default, isolated available; leverage any integer up to the asset max (ETH 25x up to $100M notional, BTC 40x); maintenance margin = half the initial margin at max leverage (ETH 2%); liquidation uses mark price; backstop liquidation below 2/3 of maintenance margin takes the maintenance margin [21][22][23].
- Funding is paid hourly as 1/8 of an 8-hour rate; contracts are USDC-margined, USDT-denominated linear perps for most assets [24].
- Collateral is USDC on HyperCore; funding the account means bridging USDC from Arbitrum (a cost and latency the economics assessment must include).

**Phase need.** Funding history and metadata: Phase 2–3. Live account state and WebSocket: Phase 4. Orders: Phase 5 (testnet first).

### 3.3 Liquid staking tokens

| Token | Issuer model | Primary redemption | Aave v3 collateral | Notes |
| --- | --- | --- | --- | --- |
| **wstETH** (Lido) | Decentralised node-operator set; stETH rebases, wstETH is the non-rebasing wrapper | `WithdrawalQueueERC721`: `requestWithdrawalsWstETH` → wait for oracle finalization → `claimWithdrawals`; 100 wei–1000 stETH per request; cannot be cancelled; finalization rate can be discounted after slashing [48] | Yes on Ethereum, Arbitrum, Optimism, Polygon [50]; also listed on further L2 markets such as Base (verify live via `getReservesData`); ETH-correlated E-mode | Official TypeScript SDK `@lidofinance/lido-ethereum-sdk` (stake, wrap, withdrawals, rewards) on viem [49]. Secondary-market exit is normally faster than the queue [48]. |
| **rETH** (Rocket Pool) | Permissionless node operators; value-accruing token | Unstake against the protocol's deposit pool ("no minimum lock-up", subject to pool liquidity) or DEX [51] | Yes on Ethereum Core [52][53] | ~1.89% 7-day APR displayed on 2026-10-21 [51]; smaller DEX depth than wstETH. |
| **cbETH** (Coinbase) | Custodial issuer; value-accruing token | Unwrap via a Coinbase account; otherwise DEX | Yes on Ethereum Core, priced via CAPO exchange-rate feed [14]; listed on the Base market (verify live) | Issuer/counterparty risk differs from wstETH/rETH; relevant on Base. |
| **jitoSOL / mSOL** (Solana, optional) | Solana stake pools | Stake-pool unstake (epoch delay) or DEX | No (Aave is EVM-only); needs a Solana lending venue | Only worth modelling as the "second ecosystem" in Phase 2 if a Solana lending integration is in scope; otherwise use an L2 Aave market as the second ecosystem. |

Common requirements: read the exchange rate on-chain (not from a price API), model the discount/depeg risk separately from ETH price risk, and treat primary redemption as T2 liquidity (days), never as an emergency exit (`risk-governor.md` §6).

### 3.4 DEX and liquidity provision (optional)

Swaps are needed even without an LP strategy (entering wstETH, unwinding loops, converting borrowed assets). Uniswap recommends the **Universal Router** (composes v2/v3/v4 and uses Permit2) for programmatic swaps; v4 uses a single `PoolManager` with hooks and flash accounting, and the `@uniswap/v4-sdk` + `@uniswap/universal-router-sdk` planners encode `V4_SWAP` commands [56]. Aggregators (quoting across venues) can be evaluated later; at seed scale a single-venue quote with a strict slippage cap and simulation is sufficient. LP (`PositionManager`, concentrated ranges) is a Phase 7 strategy and must pass the §4F criteria including loss-versus-rebalancing estimates. Uniswap publishes AI "skills"/plugins (`uniswap-ai`) rather than an official MCP server [56].

### 3.5 Oracles

- **Chainlink Data Feeds**: push-based on-chain aggregates read through `AggregatorV3Interface.latestRoundData()`; updated on deviation threshold or heartbeat, so consumers must check `updatedAt` against the feed's heartbeat and reject zero/negative answers; on L2s also check the **Sequencer Uptime Feed** (answer 0 and grace period elapsed since `startedAt`) [54]. `@chainlink/contracts` npm package [54].
- **Aave's oracle**: `AaveOracle` returns the price the protocol itself uses for health factor; LSTs are priced by **CAPO** feeds composed of the on-chain exchange rate and ETH/USD, with Chainlink SVR feeds adopted for liquidations on several assets [14]. Liquidation math must use the protocol's oracle; independent feeds are for divergence alarms.
- **Hyperliquid**: mark price (CEX composite + book) drives liquidations; oracle price drives funding [21][24].
- **Chainlink Data Streams** (pull-based, sub-second, HMAC-authenticated SDKs) is not needed for a slow-moving balance-sheet controller [54].

### 3.6 Market and yield data

- **DefiLlama**: free `https://api.llama.fi` (protocols, TVL) and yields `/pools`; Pro API (key in the URL path, ≈ $250–300/month, 1M calls/month) adds `/yields/poolsBorrow`, `/yields/chartLendBorrow/{pool}`, `/yields/lsdRates`, and `/yields/perps` (funding and open interest across venues) [58]. The borrow-rate and LST-rate histories are the main value for Phase 3 backtests.
- **CoinGecko**: Demo plan 10k calls/month, 100/min, 1 year of daily history, attribution required; paid tiers from $29/month [57].
- **Aave GraphQL** history and **Hyperliquid `fundingHistory`** are the primary sources for the two candidate venues; aggregate APIs are cross-checks.

### 3.7 RPC providers

Numbers verified by QuickNode's own comparison (July 2026) and provider pages [39][46]:

| Provider | Ongoing free tier | Entry paid | Notes |
| --- | --- | --- | --- |
| Alchemy | 30M CU/month, 300 CU/s (≈ 15–25 rps) | Pay-as-you-go ≈ $0.45–0.525 per 1M CU | `eth_call` 26 CU, `eth_simulateV1` 40 CU; debug/trace not on Free; Portfolio API included [39][42] |
| Infura | 3M credits/day | Developer $50/month | `eth_call` 80 credits; daily quota halts until reset [46] |
| QuickNode | 1-month trial (10M credits, 15 rps), no permanent free tier | Build $49/month | Archive on all plans; broadest chain list [46] |
| Public RPCs | Keyless, ~5–10 rps | — | Fallback only; no SLA |

Design: `viem` fallback transport (primary + secondary + public), multicall batching, caching, and a per-provider budget in the opportunity engine. The governor's independent feed should use a different provider from the executor's.

### 3.8 Transaction simulation

Mandatory before every signature (`risk-governor.md` §7). Options:

- **Local fork (Foundry `anvil` against an archive-capable RPC)**: free, deterministic, supports state overrides and multi-step bundles; the baseline for Phase 4–6 and for CI.
- **`eth_simulateV1`** (standard JSON-RPC; 40 CU on Alchemy): multiple calls with block/state overrides, logs, and transfer traces, but no full nested call traces [41][42]. **`debug_traceCall`** with `callTracer` for full frames where available [41].
- **Alchemy's proprietary `alchemy_simulate*` family was deprecated on 2026-09-30** [41]; do not build on it.
- **Tenderly**: Simulation API, bundles, Virtual TestNets, decoded asset changes; **API access and the MCP server require a paid plan** with unpublished rate limits [47]. Optional upgrade when decoded traces in CI justify the cost.
- **Hyperliquid has no simulation endpoint**; pre-trade checks are computed locally from `clearinghouseState`, `meta` margin tables, and the liquidation-price formula [21][23], and orders are placed `reduceOnly`/`Ioc` where appropriate with explicit size caps.

### 3.9 Signing, custody, and on-chain policy

- **EVM hot key behind a smart account.** Safe with the **Zodiac Roles Modifier v2** (deploy only mastercopy 2.1.1): the executor's key is a role member allowed to call only allowlisted targets/functions with parameter conditions (`scopeFunction`), amount meters (`WithinAllowance`, e.g., a daily USDC budget), and call-rate meters (`CallWithinAllowance`); recipients constrained to the avatar (own address) [60]. Zodiac documents this pattern explicitly for AI agents [60].
- **Hosted KMS with a policy engine** (Turnkey-style default-deny policies on destination, function, value, and quorum) is the alternative when hardware-backed keys and audit tooling matter more than self-hosting [60].
- **Hyperliquid API wallet** with a short `valid_until`, one agent per process, rotation, and master key kept offline [25][61].
- **No infinite ERC-20 approvals**; approvals sized per intent and revoked after unwind.

### 3.10 Fiat on/off-ramp

Moving ~$1k from a bank to USDC on an L2 requires a KYC'd exchange account with an API (for example Coinbase via the CDP APIs/CLI or Advanced Trade) or a manual transfer. This is write-capable and must sit in the execution plane with the same approval rules; at seed scale it will likely remain a user-performed step in Phase 5–6. The CDP CLI also acts as an MCP server exposing every CDP API as tools, with the vendor's own guidance to confirm all mutating calls [59].

### 3.11 Write-capability constraints (applies to every "W" row)

1. Writes are only attempted from the execution plane with an `Authorization` from the risk governor (and user approval where the phase requires).
2. Signer-side allowlist of contract addresses (from the address book, pinned by commit), function selectors, tokens, and recipients.
3. Per-transaction and per-period spending limits enforced both in the signer and on-chain/venue-side where the integration supports it.
4. Simulation hash attached to every signing request; mismatch blocks signing.
5. Venue keys cannot withdraw (Hyperliquid agent wallets); EVM keys cannot send to arbitrary addresses (role conditions).

---

## 4. MCP server survey

Spec §10: "an MCP interface may help an AI agent discover or invoke tools, but it is not a substitute for a reliable execution and risk-control layer." Survey as of 2026-10-21:

| Protocol / service | MCP server | Maintainer | Maturity (2026-10-21) | Capabilities | Auth | Usable here as |
| --- | --- | --- | --- | --- | --- | --- |
| Aave | `https://mcp.aave.com` | **Aave Labs (official)**, launched 2026-09-08 | New (≈6 weeks); remote Streamable HTTP; serves 2025 and 2026 MCP revisions; shared service, "handle 401/429" [11] | Reads (chains, markets, reserves, rates, time series, positions, health factor, rewards), `preview_action` simulation, **unsigned transaction building** for supply/borrow/repay/withdraw/E-mode/liquidation, swaps, v4 hub data, governance [11] | None today | Research/discovery in Phase 1–4; never the execution path |
| Hyperliquid | None official. Third-party: Bitquery `https://mcp.bitquery.io` (18 read-only tools, OAuth) [29]; Chainstack `https://mcp.chainstack.com/mcp` (developer-onboarding focus) [30]; hosted connectors from smaller vendors, some of which offer trading tools | Bitquery, Chainstack, others | Read-only servers are usable; any third-party server that can place orders is out of policy | Markets, funding, OI, liquidations, wallets (read) | OAuth / none | Market research only |
| CoinGecko | `https://mcp.api.coingecko.com/mcp` (keyless) / `mcp.pro-api.coingecko.com` (key) / local `@coingecko/coingecko-mcp` | **CoinGecko (official)** | Stable | Prices, market data, on-chain DEX data [57] | None / API key | Research |
| DefiLlama | `https://mcp.defillama.com/mcp` | **DefiLlama (official)** | Stable; requires paid API plan; one client per account [58] | 23 tools: TVL, yields, prices, fees, stablecoins, bridges [58] | Browser OAuth + API plan | Research (Phase 3) |
| Alchemy | `https://mcp.alchemy.com/mcp` | **Alchemy (official)**; local npm server retired 2026-09-30 [43] | Stable; 168 tools; OAuth | Balances, prices, tx history, simulation, traces, account abstraction [43] | OAuth (Alchemy account) | Developer tooling; not a runtime dependency |
| Tenderly | `https://mcp.tenderly.co/mcp` | **Tenderly (official)** | 59 tools; **paid plan only**; OAuth via WorkOS [47] | Virtual TestNets, simulation, tracing, contract inspection [47] | OAuth + paid plan | Developer tooling |
| Plaid | Dashboard MCP `https://api.dashboard.plaid.com/mcp/` + local dev toolkit | **Plaid (official)** | "Under active development, breaking changes may occur" [35] | Dashboard diagnostics and usage analytics only (debug Items, Link analytics); **no account-data access** [35] | Plaid OAuth, Production approval | Operations tooling only |
| Chainlink | `@chainlink/mcp-server` (local, npm) | **Chainlink (official, "Early Access")** | 0.0.1-alpha, published ≈ a year ago; docs assistant for CCIP and Data Feeds; needs an OpenAI key [55] | Documentation Q&A, not data | OpenAI key | Not useful at runtime |
| Uniswap | No official MCP; `uniswap-ai` skills/plugins for coding agents [56]; third-party hosted connectors exist [62] | Uniswap Labs (skills), third parties (MCP) | Skills are maintained; third-party MCPs unvetted | Swap/LP integration guidance; quotes | — | Developer tooling |
| Lido / Rocket Pool / Coinbase cbETH | No official MCP; third-party Lido connector listed in registries [62] | Third parties | Unvetted | Staking data | — | Not used |
| Coinbase CDP | `cdp mcp` (stdio, generated from OpenAPI) and AgentKit MCP extension | **Coinbase (official)** | Launched 2026-04-08; vendor recommends confirming all mutating calls [59] | Every CDP API: wallets, trading, payments, on-chain tools | CDP API key (JWT) | Possible on-ramp tooling; write tools out of policy |

### 4.1 Assessment

- **Coverage is now good for discovery.** Aave, CoinGecko, DefiLlama, Alchemy, and Tenderly have official servers; Aave's is the only protocol-native one on our candidate list and it exposes exactly what the opportunity engine needs (markets, rates, E-modes, health factors, history).
- **Hyperliquid has no official MCP.** Only read-only third-party indexers (Bitquery) and developer-help servers (Chainstack) exist; trading must go through the documented API/SDKs.
- **Maturity concerns.** Aave MCP is weeks old, keyless, shared, and explicitly subject to 401/429; Plaid's is diagnostics-only; Chainlink's is a stale alpha; third-party servers that can sign or place orders have no accountability model.
- **Policy for this platform.**
  1. MCP servers may be used by the AI reasoning layer and by developers for **discovery, research, comparison, and explanation** (Phase 1–4 opportunity engine, documentation lookup).
  2. MCP output is **never an execution input**: any transaction payload produced by an MCP tool (including Aave's unsigned transactions) is discarded; the execution layer re-derives calldata from the official SDK/contracts, simulates it, and passes it through the governor and signer.
  3. No MCP server is granted write credentials, keys, or agent wallets. Read-only tokens only, scoped to research data.
  4. MCP tool outputs are treated as untrusted content (prompt-injection surface) and are logged with provenance like any other data source.
  5. Runtime paths (ingestion, governor, executor) depend on APIs/SDKs with published limits, not on MCP endpoints without SLAs.

---

## 5. Gaps and risks identified

| Gap / risk | Impact | Mitigation |
| --- | --- | --- |
| Aave v3.3 full-liquidation rule below $2,000 collateral/debt [5] | At seed scale any HF < 1 event liquidates the whole position plus bonus | Wider HF buffers at seed scale; prefer E-mode correlated pairs; see `risk-governor.md` §3–4 |
| Hyperliquid $10 minimum order and address-based action limits [17][18] | Hedge rebalancing granularity and frequency are constrained for a sub-$1k hedge | Hedge only above a minimum notional; batch adjustments; economics assessment to quantify |
| USDC must be bridged to HyperCore for margin | Cross-venue margin top-ups are slow; cannot rescue a hedge instantly from Aave-side collateral | Pre-fund a margin buffer at the venue; isolated margin so a hedge liquidation is bounded |
| Tenderly API is paid-only; Alchemy's simulate APIs are deprecated [41][47] | No free hosted decoded simulation | Local `anvil` fork + `eth_simulateV1` as the mandatory baseline |
| No official Hyperliquid TypeScript SDK | Monorepo depends on a community SDK (`@nktkas/hyperliquid`) | Pin versions, wrap behind an internal interface, keep the official Python SDK as a reference implementation for signing tests |
| Teller lacks investments; Plaid is rate-limited per Item and billed per account | Full consolidated balance sheet may need Plaid or manual entry | Phase 1 supports manual/CSV import alongside one aggregator |
| Aave v4 is new and v3 L2 instances are being pruned [8][13] | Venue/parameter churn | Parameterised simulator; address book pinned by commit; avoid wind-down networks |
| Solana LSTs need a separate stack | Second ecosystem for Phase 2 is expensive if Solana | Use an Aave L2 market as the second ecosystem unless Solana is explicitly prioritised |
| Fiat on/off-ramp has no clean programmatic path at seed scale | Seed funding and withdrawals are manual | Keep user-performed in Phase 5–6; document the procedure |

---

## 6. Sources

All accessed 2026-10-21 unless a publication date is given.

1. Aave docs — AaveKit TypeScript (`@aave/client`): https://www.aave.com/docs/aave-v3/getting-started/typescript
2. Aave docs — GraphQL API: https://aave.com/docs/aave-v3/getting-started/graphql
3. Aave Address Book (npm, Foundry, JSON API): https://github.com/aave-dao/aave-address-book/
4. Aave docs — View contracts (`UiPoolDataProvider`, `getEModes`): https://aave.com/docs/aave-v3/smart-contracts/view-contracts
5. Aave help — Health factor & liquidations (50%/100% close factor, $2,000 and $1,000 thresholds): https://aave.com/help/borrowing/liquidations
6. aave-v3-origin `LiquidationLogic.sol` (constants `CLOSE_FACTOR_HF_THRESHOLD`, `MIN_BASE_MAX_CLOSE_FACTOR_THRESHOLD`, `MIN_LEFTOVER_BASE`): https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/protocol/libraries/logic/LiquidationLogic.sol
7. Aave v3.3 features: https://github.com/aave-dao/aave-v3-origin/blob/main/docs/3.3/Aave-v3.3-features.md
8. Aave Labs — "Aave V4 is Live on Ethereum" (2026-03-30): https://www.aave.com/blog/aave-v4-live-ethereum
9. Aave docs — v4 Spokes: https://aave.com/docs/aave-v4/liquidity/spokes
10. Aave docs — Changelog (v3.2 liquid eModes, v3.3, v3.6, v3.7, v4 deployments): https://www.aave.com/docs/resources/changelog
11. Aave MCP — docs https://www.aave.com/docs/mcp, getting started https://aave.com/docs/mcp/getting-started, launch post (2026-09-08) https://www.aave.com/blog/introducing-aave-mcp-server
12. Aave V3 market list with live data (third-party tracker, data dated 2026-10-21): https://aavetracker.com/v3/
13. Aave governance — "[TEMP CHECK] Focussing the Aave V3 Multichain Strategy" (wind-down of zkSync, Metis, Soneium): https://governance.aave.com/t/temp-check-focussing-the-aave-v3-multichain-strategy/23434
14. Aave governance — Aave <> Chainlink SVR v1 activation, Phase 3 (CAPO feed composition for LSTs): https://governance.aave.com/t/direct-to-aip-aave-chainlink-svr-v1-activation-phase-3/22387
15. Hyperliquid docs — API overview and SDK list: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
16. Hyperliquid docs — Info endpoint: https://hyperliquid.gitbook.io/Hyperliquid-docs/for-developers/api/info-endpoint
17. Hyperliquid docs — Exchange endpoint (orders, `approveAgent`, "$10" minimum order error): https://hyperliquid.gitbook.io/Hyperliquid-docs/for-developers/api/exchange-endpoint
18. Hyperliquid docs — Rate limits and user limits: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits
19. Hyperliquid docs — Fees: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees
20. Hyperliquid docs — Builder codes: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes
21. Hyperliquid docs — Liquidations: https://hyperliquid.gitbook.io/Hyperliquid-docs/trading/liquidations
22. Hyperliquid docs — Margining: https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining
23. Hyperliquid docs — Margin tiers: https://hyperliquid.gitbook.io/Hyperliquid-docs/trading/margin-tiers
24. Hyperliquid docs — Contract specifications: https://hyperliquid.gitbook.io/Hyperliquid-docs/trading/contract-specifications
25. Hyperliquid docs — Nonces and API wallets: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets
26. hyperliquid-dex/hyperliquid-python-sdk: https://github.com/hyperliquid-dex/hyperliquid-python-sdk
27. `@nktkas/hyperliquid` on npm (v0.33.3, updated 2026-08-02): https://www.npmjs.com/package/@nktkas/hyperliquid
28. hyperliquid-dex/hyperliquid-rust-sdk: https://github.com/hyperliquid-dex/hyperliquid-rust-sdk
29. Bitquery — Hyperliquid MCP server: https://docs.bitquery.io/docs/mcp/hyperliquid/
30. Chainstack — Hyperliquid MCP: https://chainstack.com/ship-faster-with-hyperliquid-mcp/
31. Plaid — Pricing (Limited Production, billing models): https://plaid.com/pricing/
32. Plaid — Rate limit exceeded errors (per-Item and per-client limits): https://plaid.com/docs/errors/rate-limit-exceeded/
33. Plaid — Investments product: https://plaid.com/products/investments/
34. plaid/plaid-node: https://github.com/plaid/plaid-node/
35. Plaid — Dashboard MCP server: https://plaid.com/docs/resources/mcp/
36. Teller: https://teller.io/
37. MX vs Teller comparison (2026): https://faun.dev/toolbox/mx-vs-teller/
38. Open Banking Tracker — Best open banking API providers for developers in 2026: https://www.openbankingtracker.com/blog/best-open-banking-api-providers-developers-2026
39. Alchemy — Pricing https://www.alchemy.com/pricing and Throughput https://www.alchemy.com/docs/reference/throughput.md
40. Alchemy — Portfolio API, Tokens by Wallet: https://www.alchemy.com/docs/data/portfolio-apis/portfolio-api-endpoints/portfolio-api-endpoints/get-tokens-by-address
41. Alchemy — Simulation deprecation (2026-09-30) and alternatives: https://support.alchemy.com/articles/8324617353-what-to-use-instead-of-the-deprecated-alchemy-simulate-methods and https://www.alchemy.com/docs/reference/simulation-faqs.md
42. Alchemy — `eth_simulateV1` reference (40 CU): https://www.alchemy.com/docs/chains/ethereum/ethereum-api-endpoints/eth-simulate-v-1.md
43. Alchemy MCP Server: https://www.alchemy.com/docs/alchemy-mcp-server.md and https://github.com/alchemyplatform/alchemy-mcp-server
44. Zerion — API for wallets (tiers): https://zerion.io/api/wallets/
45. Etherscan — Rate limits: https://docs.etherscan.io/rate-limits
46. QuickNode — "Deep Dive Comparison: Infura, Alchemy, Quicknode" (2026-07-07, numbers verified August 2026): https://www.quicknode.com/blog/deep-dive-comparison-infura-alchemy-quicknode
47. Tenderly — Pricing https://tenderly.co/pricing, FAQ API https://docs.tenderly.co/troubleshooting/api, FAQ simulations https://docs.tenderly.co/troubleshooting/simulations, MCP overview https://docs.tenderly.co/ai-tools/overview
48. Lido — Tokens integration guide (withdrawals): https://github.com/lidofinance/docs/blob/main/docs/guides/lido-tokens-integration-guide.md
49. lidofinance/lido-ethereum-sdk: https://github.com/lidofinance/lido-ethereum-sdk
50. Lido help — stETH & wstETH on Aave: https://help.lido.fi/en/articles/8459223-guide-how-to-use-steth-wsteth-on-aave
51. Rocket Pool: https://rocketpool.net/
52. Aave governance — Onboard rETH to Aave V3 Ethereum: https://governance.aave.com/t/arc-onboard-reth-rocket-pool-eth-to-aave-v3-ethereum-market/11371
53. Aave governance — E-mode risk parameters update (2023-06-06): https://governance.aave.com/t/arfc-emode-risk-parameters-aave-eth-v3-pool-update/13570
54. Chainlink docs — Data Feeds overview https://docs.chain.link/data-feeds/overview, Historical data (heartbeat/deviation) https://docs.chain.link/data-feeds/historical-data, Data Streams overview (updated 2026-09-16) https://docs.chain.link/data-streams/overview, Data Streams reference https://docs.chain.link/data-streams/reference/overview
55. `@chainlink/mcp-server` on npm: https://www.npmjs.com/package/@chainlink/mcp-server
56. Uniswap — Protocols overview https://developers.uniswap.org/docs/protocols/overview, v4 swap routing https://docs.uniswap.org/contracts/v4/guides/swap-routing, uniswap-ai https://github.com/Uniswap/uniswap-ai
57. CoinGecko — API pricing https://www.coingecko.com/en/api/pricing and MCP server https://docs.coingecko.com/ai-integration/mcp-server
58. DefiLlama — API docs https://api-docs.defillama.com/llms.txt, Pro API https://api-docs.defillama.com/llms-pro.txt, MCP https://defillama.com/mcp
59. Coinbase — CDP for agents (CLI/MCP) https://docs.cdp.coinbase.com/get-started/build-with-ai/cdp-for-agents, AgentKit MCP extension https://docs.cdp.coinbase.com/agent-kit/core-concepts/model-context-protocol, CDP CLI launch (2026-04-08) https://www.coinbase.com/developer-platform/discover/launches/cdp-cli
60. Zodiac docs — Roles Modifier https://docs.zodiac.eco/developers/roles, Allowances https://docs.zodiac.eco/developers/roles/allowances, Permission an AI agent https://docs.zodiac.eco/developers/roles/ai-agents
61. Openfort — Hyperliquid agent wallets recipe (permission table, rotation guidance): https://www.openfort.io/docs/recipes/hyperliquid/agent-wallets
62. Glama registry listing of third-party hosted connectors (Lido, Uniswap): https://glama.ai/mcp/connectors?query=namespace%3Aio.github.junct-bot
