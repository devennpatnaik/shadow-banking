# Shadow Banking — Project Context

Stable goals, constraints, and decisions for the Project. Progress lives in `notes.md`.

## User guidance (as stated)

- DeFi platforms and their APIs / MCPs are the enabling layer for this project.
- Aave (lending/collateral) and Hyperliquid (perpetuals/hedging) are ideas worth evaluating, not directives.
- Initial seed capital assumption: ~$1,000, architecture must scale to larger balances.
- Initial evaluation hurdle: 10% annualized net return, configurable.
- Build incrementally; never start with unrestricted autonomous deployment.

## Product specification (verbatim from the user)

# Build a Comprehensive Personal Shadow-Banking Platform

## 1. Product Vision

Build a comprehensive, AI-managed personal shadow-banking platform that enables an individual to operate a sophisticated financial balance sheet normally associated with banks, hedge funds, and institutional treasuries.

The user provides:
- Banking and financial account information.
- Financial disclosures, including income, expenses, assets, liabilities, liquidity needs, and risk tolerance.
- An initial seed deposit.

The platform builds and manages a personal financial balance sheet designed to generate recurring yield, deploy capital efficiently, manage liabilities, and compound wealth over time.

**The product's output is the user's consolidated net yield, after financing costs, transaction costs, losses, and other expenses.**

The platform should not simply recommend investments. It should determine how the user's capital can be deployed, what assets can support borrowing, how much liquidity should be retained, where borrowed capital should go, and how the resulting balance sheet should be managed over time.

The ultimate objective is to increase the productive financial capacity of the user's equity without exposing the user to unacceptable risks.

This is not merely a trading bot, robo-advisor, portfolio tracker, or yield aggregator. It is an automated personal financial intermediary.

## 2. Inputs and Financial Profile

### A. Account connectivity

Allow users to connect supported financial accounts through secure integrations.

Potential sources include:
- Bank accounts.
- Brokerage accounts.
- Digital-asset wallets.
- Lending and borrowing accounts.
- Other financial accounts where supported.

Read-only access should be the default during onboarding.

The platform should distinguish between assets it can observe and assets it is authorized and technically able to manage.

### B. Financial disclosures

Collect the information needed to understand the user's overall financial position:
- Income and income stability.
- Recurring expenses.
- Existing debts and interest rates.
- Emergency savings.
- Near-term cash requirements.
- Investment horizon.
- Risk tolerance.
- Tax residency and relevant tax considerations.
- Restrictions on borrowing, leverage, or particular asset classes.

Use these disclosures to determine how much capital is genuinely available for deployment.

Do not treat the user's entire bank balance as investable capital.

### C. Seed deposit

The user contributes an initial amount of capital to the platform's managed strategy.

Initially, assume approximately $1,000 to validate the system, while designing the architecture to support larger balances.

The system should explain how much of the deposit is:
- Immediately liquid.
- Deployed into productive assets.
- Committed as collateral.
- Borrowed against.
- Held as a contingency reserve.

The platform must clearly distinguish user-owned capital from borrowed capital.

## 3. The Core Mechanism: A Managed Personal Balance Sheet

The platform should reproduce selected financial-intermediation functions at the individual level.

The central process is:

**Equity → productive assets → collateral → borrowing → additional productive assets → recurring cash flow → retained earnings → larger balance sheet.**

For example:

1. The user deposits $1,000.
2. The system acquires an eligible productive asset.
3. Where economically appropriate, it stakes or otherwise earns yield on that asset.
4. It deposits the asset, or an eligible liquid representation of it, into a lending market as collateral.
5. It borrows against the collateral within predefined risk limits.
6. It deploys the borrowed funds into additional productive assets or another approved yield-generating activity.
7. It tracks the additional assets, liabilities, income, and financing costs.
8. It repeats the process only while the incremental return justifies the incremental risk.
9. It directs retained earnings toward debt repayment, additional productive assets, or reserves.

The platform should calculate the optimal stopping point for recursive borrowing rather than blindly maximizing leverage.

It must also account for collateral haircuts, liquidation thresholds, borrowing limits, liquidity constraints, and the possibility that a lending market stops accepting withdrawals or changes its terms.

## 4. Yield Generation

The system should evaluate multiple forms of recurring yield. Each is an optional component, not a mandatory strategy.

### A. Yield-bearing collateral

Acquire assets that generate staking rewards or other protocol-defined income.

A liquid-staking mechanism could be used to maintain a transferable representation of a staked asset, where suitable.

The system should evaluate whether that asset is accepted as collateral and whether its yield adequately compensates for its additional risks.

### B. Collateralized borrowing

Borrow against eligible assets to increase productive capital.

A decentralized lending protocol could provide collateral management, borrowing, repayment, interest-rate data, and liquidation information.

The system must compare the expected return on deployed borrowing proceeds with the full cost of borrowing.

### C. Leveraged productive assets

Where justified, redeploy borrowed funds into additional yield-bearing assets and use eligible additional assets as collateral.

For every incremental borrowing step, calculate:

- Additional productive assets acquired.
- Additional recurring income.
- Additional interest expense.
- Additional equity exposure.
- Additional liquidation risk.
- Incremental return on equity.

Stop increasing leverage when the marginal economics or risk become unattractive.

### D. Hedged carry

Where useful, use derivatives to reduce unwanted exposure to the market price of productive assets.

For example, a perpetual-futures venue could provide a short position against an eligible long asset position.

Evaluate the economics as:

Staking or asset yield + funding received − borrowing costs − hedging costs − transaction costs.

Funding can reverse, hedges can fail, and derivatives introduce independent liquidation and counterparty risks. The system must model these explicitly.

### E. Liquidity provision

The platform could allocate capital to liquidity pools that earn transaction fees or other recurring rewards.

Where suitable, it could hedge some of the resulting asset-price exposure.

Before allocating capital, estimate impermanent loss or loss-versus-rebalancing, pool liquidity, withdrawal constraints, hedge costs, and smart-contract risk.

### F. Other financial strategies

The architecture should allow additional strategies to be introduced as modular components.

Every new strategy must demonstrate:
- A clear economic mechanism.
- Verifiable data.
- Measurable costs.
- A defined risk model.
- A reliable entry and exit process.
- A programmatic execution path.

Do not add a strategy merely because it advertises a high APY.

Do not prioritize arbitrage or high-frequency strategies that depend on speed advantages over institutional participants.

## 5. Strategy Selection and Capital Allocation

The system should evaluate the user's balance sheet as a whole rather than optimize individual positions in isolation.

For every candidate strategy, calculate:

**Expected net return = recurring income − financing costs − execution costs − expected losses and other expenses.**

Account for:
- Staking rewards.
- Lending income, where applicable.
- Borrowing rates.
- Derivatives funding.
- Liquidity-provider fees.
- Incentives.
- Gas and transaction fees.
- Slippage.
- Hedging costs.
- Expected liquidation costs.
- Estimated protocol and counterparty risk.

Show gross yield, estimated net yield, realized net yield, and relevant risk measures separately.

Compare alternatives based on both risk-adjusted return and absolute dollar contribution. Consider the user's total liquidity requirements and existing exposures.

The platform must be able to conclude that no available strategy is sufficiently attractive.

Use 10% annualized net return as an initial evaluation hurdle, not a promised return or a requirement to take more risk. The hurdle should be configurable.

If no strategy meets the user's criteria, preserve capital in an appropriate liquid form rather than manufacture yield through excessive borrowing.

## 6. Liquidity and Liability Management

Treat liquidity as a core product function.

The platform must distinguish:
- Immediately withdrawable cash.
- Liquid assets that can be sold under normal conditions.
- Assets subject to staking or redemption delays.
- Collateral that is locked or committed.
- Borrowed funds.
- Contingent obligations, including derivatives margin requirements.

Use the user's expected expenses and cash requirements to establish a liquidity reserve.

A reserve of approximately 10–30% of deployable capital may be a starting assumption for simulation, not a universal rule. Determine the appropriate level based on obligations, volatility, liquidation risk, and withdrawal access.

The platform should be able to:
- Reserve funds for upcoming expenses.
- Repay debt when appropriate.
- Raise liquidity before a risk threshold is breached.
- Reduce leverage during stress.
- Avoid relying on an asset's advertised liquidity when its market is impaired.
- Prevent new deployments from compromising required liquidity.

Never assume that collateral can always be withdrawn immediately or that a borrowing position can always be refinanced.

## 7. Risk Governor

Implement a risk-management system that has authority over the strategy optimizer and execution engine.

Monitor:
- Total leverage and loan-to-value ratios.
- Health factors and liquidation distance.
- Collateral and debt volatility.
- Borrowing-rate changes.
- Funding-rate changes.
- Concentration by asset, protocol, and network.
- Stablecoin depeg risk.
- Smart-contract and oracle risks.
- Derivatives margin and liquidation risk.
- Protocol utilization and withdrawal liquidity.
- Counterparty and operational risks.
- Portfolio drawdown and reserve adequacy.

Define explicit risk states.

**Normal:** Operate within approved limits.

**Caution:** Stop increasing leverage and consider adding reserves.

**Deleveraging:** Repay debt, reduce exposure, or add collateral.

**Emergency:** Execute the safest feasible unwind or repayment plan, subject to available liquidity and market conditions.

The system should prioritize survival over yield.

Set hard limits for maximum leverage, position size, protocol concentration, daily loss, and portfolio drawdown.

The risk governor must be able to reject or override any proposed action. The AI must never have unrestricted authority to move all user funds.

## 8. Accounting and Consolidated Performance

Maintain a continuously updated ledger of all relevant assets, liabilities, cash flows, and transactions.

Calculate:

**Net asset value (NAV) = fair value of assets − liabilities.**

Track:
- Initial equity and subsequent deposits or withdrawals.
- Productive assets and collateral.
- Borrowing balances and accrued interest.
- Staking rewards.
- Lending income.
- Funding payments.
- Liquidity-provider income.
- Incentives.
- Trading and transaction fees.
- Realized and unrealized profit or loss.
- Liquidation and other losses.
- Taxes and estimated tax liabilities where supported.

The primary output is the user's consolidated performance, not a protocol's advertised APY.

Report:
- Total NAV.
- Net profit and loss.
- Net annualized yield.
- Realized return.
- Return on initial equity.
- Return on average equity.
- Return on deployed capital.
- Gross assets relative to equity.
- Total debt and financing costs.
- Liquid reserves.
- Maximum drawdown.
- Current liquidation exposure.

Separate realized results from projections. Clearly label annualized estimates and explain their assumptions.

Do not count borrowed principal as income or treat transfers between the user's accounts as profit.

## 9. Compounding and Retained Earnings

Automatically evaluate how to allocate net earnings.

Potential uses include:
- Repaying debt.
- Increasing productive collateral.
- Acquiring additional yield-bearing assets.
- Increasing liquid reserves.
- Funding upcoming expenses.

Recalculate the balance sheet and risk limits after every material change in NAV or market conditions.

Compounding should increase the user's equity and productive capacity over time. It should not automatically increase leverage.

The system must be able to retain earnings in liquid form when reinvestment is unattractive.

## 10. Product Architecture

Build the platform as modular services.

**Account and disclosure layer:** Ingests financial data, user constraints, and available balances.

**Balance-sheet engine:** Reconciles assets, liabilities, equity, collateral, and available borrowing capacity.

**Opportunity engine:** Collects current yield, borrowing, funding, liquidity, and risk data.

**Strategy engine:** Models recursive borrowing, leveraged productive assets, hedged carry, and optional liquidity provision.

**Risk governor:** Enforces hard limits and controls emergency actions.

**Execution layer:** Submits approved transactions, repayments, withdrawals, and hedges through official APIs or SDKs where possible.

**Accounting engine:** Maintains the ledger and calculates NAV and net performance.

**Portfolio controller:** Determines allocations, reserves, debt repayment, and compounding.

**User interface:** Shows the balance sheet, yield sources, debt, risk, performance, and proposed actions.

**Audit and monitoring layer:** Records decisions, transactions, data sources, failures, and risk interventions.

Use an official protocol SDK or API where appropriate; an MCP interface may help an AI agent discover or invoke tools, but it is not a substitute for a reliable execution and risk-control layer.

## 11. Security, Privacy, and Permissions

Treat banking data and financial disclosures as highly sensitive.

Use secure account connectivity, least-privilege permissions, encryption, access controls, and clear data-retention policies.

Never request banking passwords directly when a secure account-linking mechanism is available.

Keep read-only integrations separate from transaction authorization.

Use segregated wallets or accounts where practical. Protect signing credentials and avoid exposing private keys to the general AI reasoning layer.

Apply transaction limits, allowlists, simulation, and explicit authorization requirements to execution.

The platform must be transparent about whether it has custody of assets, can initiate withdrawals, or can only recommend transactions.

## 12. Compliance and Product Boundaries

Before real-money operation, determine which activities and jurisdictions require registration, licensing, disclosures, or other compliance measures.

Assess applicable rules concerning financial advice, custody, money transmission, lending, derivatives, consumer protection, privacy, tax reporting, and sanctions.

Do not assume that non-custodial software is automatically exempt from regulation.

Do not promise guaranteed yield, principal protection, or uninterrupted withdrawals. Explain that smart-contract failures, market stress, liquidations, stablecoin failures, and protocol insolvency can cause losses.

Make the user's permissions, risks, and ability to pause or terminate management explicit.

## 13. Development Sequence

Build incrementally.

**Phase 1 — Read-only financial model**
Connect data sources, ingest disclosures, and build the consolidated balance sheet. Do not execute transactions.

**Phase 2 — Shadow-bank simulator**
Model the recursive collateral-and-borrowing loop for at least two candidate asset ecosystems. Calculate leverage, net yield, equity, and liquidation risk.

**Phase 3 — Opportunity and risk engine**
Compare strategies using current and historical data. Implement reserves, risk limits, stress tests, and a no-deployment state.

**Phase 4 — Paper operation**
Run the entire controller against live data without real transactions. Track hypothetical NAV, debt, income, costs, and drawdowns.

**Phase 5 — Assisted execution**
Propose specific actions for user approval. Verify transaction construction, accounting, repayments, and unwind procedures.

**Phase 6 — Limited automation**
Deploy only a small authorized allocation, with hard-coded limits, independent risk controls, monitoring, and an emergency shutdown.

**Phase 7 — Broader management**
Expand strategies and automation only after the existing system has demonstrated reliable accounting, execution, and risk handling.

Do not begin with unrestricted autonomous deployment.

## 14. Initial Deliverables

Produce:

1. A product architecture and data-flow diagram.
2. A list of required account integrations, protocol interfaces, APIs, and SDKs.
3. A consolidated balance-sheet model.
4. A simulator for recursive collateralized borrowing.
5. A strategy economics and risk-comparison engine.
6. An LLM-compatible terminal CLI (`pnpm sb`) for status, balance sheet, simulation, and risk — not a web dashboard.
7. An accounting ledger and performance report.
8. A risk governor and emergency-action specification.
9. A phased implementation plan.
10. A clear assessment of whether the economics work with approximately $1,000 of initial capital, including transaction costs and minimum-size constraints.

## 15. Guiding Principle

Build a system that treats the user's finances as one managed balance sheet rather than a collection of disconnected accounts and investment products.

The platform should continuously answer:

**How much of the user's equity is available, how much productive capital can it safely support, what net cash flow does that capital generate, what obligations must be met, and how should retained earnings be deployed?**

The goal is to grow productive financial capacity and net wealth through disciplined collateralized borrowing, recurring yield, liability management, risk control, and compounding.

The product succeeds when it generates transparent, verifiable net returns while maintaining a clear view of the risks and obligations behind them—not when it achieves the highest advertised APY.
