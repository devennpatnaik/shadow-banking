# Simultaneous multi-use of capital

Shadow banking here means **one dollar of equity working in several techniques at the same time**. The product is a **stack of simultaneous legs** on the same equity, not a menu of mutually exclusive strategies (hold LST *or* loop *or* hold liquid).

Single-strategy comparison remains a diagnostic: it prices one technique in isolation so the composer can decide whether that technique belongs as a **leg**. It is not how the book is supposed to look when it is doing its job.

Phases 1–5 stay paper / propose-only. This document does not authorize live transactions.

Companion: product spec [`spec.md`](spec.md) §1 / §3–§5; architecture [`architecture.md`](architecture.md) §1 and §5.4.

---

## 1. Legs on the same equity

A stack is an ordered set of legs that reuse the **same** user equity. Typical productive legs (example, not a mandate):

| Leg | Role | Notes |
| --- | --- | --- |
| **A — Productive asset** | Hold a yield-bearing asset (e.g. LST) | Recurring income on the owned asset. |
| **B — Collateral** | Post that asset (or a liquid representation) as collateral | Same asset is now also pledged. The balance sheet must show both uses. |
| **C — Borrow** | Borrow against it within risk-governor limits | Debt is a liability, never income. Size is limited by HF / LTV / reserves, not by protocol max. |
| **D — Redeploy** | Put borrowed proceeds into additional productive use | Incremental income must cover financing, fees, and expected losses. |
| **E — Hedge (optional)** | Reduce unwanted price exposure (e.g. a short on a perps venue) | Funding can reverse; hedges can fail; independent liquidation risk. |
| **Reserve** | Liquidity that is **not** double-counted as productive | T0 / haircut T1 cash for expenses, margin, and unwind. Always present; not a yield source. |

The same holding can be yielding **and** collateralized **and** borrowed-against. Accounting and the balance sheet must not collapse those into a single “position” that hides reuse.

Add a leg only while **incremental net return** justifies **incremental risk** versus the configurable hurdle (default **10% annualized net**, not a promised return). Stop when the next leg fails that test or the governor vetoes it.

---

## 2. Per-leg economics and consolidated net yield

Report two layers:

1. **Per leg** — income or cost of that technique: asset yield, borrow APR, funding, hedge P&L, fees, expected loss. Gross protocol APY is a secondary input, not the product output.
2. **Consolidated net yield** — one number for the stack after financing, transaction costs, hedges, expected losses, and other expenses:

   **consolidated net = Σ(leg income) − Σ(leg costs) − expected losses**

Borrowed principal is never income. Internal transfers are never profit. Reserves do not contribute productive yield.

The CLI / LLM surface should be able to answer:

- With this equity, which simultaneous uses are active?
- What does each leg earn or cost?
- What is consolidated net?
- What is health factor / liquidation distance?
- What next leg is proposed, and was it accepted or vetoed?

Until stack fields exist on `pnpm sb status --json`, agents reconstruct this from the balance sheet, strategy/sim output, risk state, and (when present) paper or execution proposals. Do not invent legs that the engines did not emit.

---

## 3. Hold-liquid is the empty productive stack

`hold_liquid` / `noDeployment: true` is **the stack with only the reserve/cash leg** — no productive legs A–E. It is the stopping rule, not a competing product identity.

- Default hurdle remains **10% annualized net**, configurable, not a promise.
- If no additional leg clears the hurdle, keep capital in liquid form. Do not open a loop, hedge, or LP “anyway.”
- A governor veto (`veto: true`, exit `2`) rejects a proposed **next leg** (or any risk-increasing action). Do not work around it.

`recommendedAction: "operate_paper"` still means paper only in Phases 1–4; Phase 5 is propose + approve only, never broadcast.

---

## 4. Where this lands in the engines (docs, not this PR)

Code composition is out of scope for this document. Intended ownership:

| Surface | Role |
| --- | --- |
| `@shadow-banking/strategy` | Stack composer is primary; single-strategy compare is diagnostic. |
| `@shadow-banking/core` | Balance sheet shows multi-use of the same asset (yielding + collateralized + borrowed-against). |
| `@shadow-banking/controller` | Paper loop builds and extends stacks, one justified leg at a time. |
| `@shadow-banking/execution` | Proposals are ordered stack steps (legs), still propose/approve only. |
| `pnpm sb status` | Report active legs, per-leg P&L, consolidated net, HF, next-leg / veto. |

Risk governor authority, paper/read-only gates, and “no unrestricted automation” are unchanged. See [`risk-governor.md`](risk-governor.md).
