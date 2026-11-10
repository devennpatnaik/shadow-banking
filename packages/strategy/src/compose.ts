import { ONE, ZERO, d, max0, min, seedDepositBreakdown, type Decimal } from '@shadow-banking/core';
import type { ComparisonInput } from './types.js';
import {
  actionGasUsd,
  amortize,
  cheapRampRoundTripUsd,
  loopRisk,
  riskAdjustedApy,
  unleveredRisk,
  yieldStack,
} from './economics.js';
import type { LegKind, StackLeg, CapitalStack, ProposedStackLeg } from './stack-types.js';
import { LEG_ORDER } from './stack-types.js';

const GOVERNOR_MAX_LOOP_LEVERAGE = d(3);
const TARGET_HF = d('1.50');
const EPS = d('0.01');

interface Book {
  reserveUsd: Decimal;
  productiveUsd: Decimal;
  pledgedUsd: Decimal;
  idleBorrowedUsd: Decimal;
  debtUsd: Decimal;
  hedgeNotionalUsd: Decimal;
  hedgeMarginUsd: Decimal;
  grossIncomeUsd: Decimal;
  financingUsd: Decimal;
  executionUsd: Decimal;
  expectedLossUsd: Decimal;
  oneOffUsd: Decimal;
}

function clone(b: Book): Book {
  return { ...b };
}

function emptyBook(reserveUsd: Decimal, reserveIncome: Decimal): Book {
  return {
    reserveUsd,
    productiveUsd: ZERO,
    pledgedUsd: ZERO,
    idleBorrowedUsd: ZERO,
    debtUsd: ZERO,
    hedgeNotionalUsd: ZERO,
    hedgeMarginUsd: ZERO,
    grossIncomeUsd: reserveIncome,
    financingUsd: ZERO,
    executionUsd: ZERO,
    expectedLossUsd: ZERO,
    oneOffUsd: ZERO,
  };
}

function ownerEquity(input: ComparisonInput): Decimal {
  return input.capital.deployableUsd;
}

function navOf(b: Book): Decimal {
  return b.reserveUsd.plus(b.productiveUsd).plus(b.idleBorrowedUsd).minus(b.debtUsd);
}

function leverageOf(b: Book, equity: Decimal): Decimal {
  const gross = b.reserveUsd.plus(b.productiveUsd).plus(b.idleBorrowedUsd);
  return equity.gt(0) ? gross.div(equity) : ZERO;
}

function riskOf(input: ComparisonInput, b: Book) {
  if (b.debtUsd.gt(0) && b.pledgedUsd.gt(0)) {
    return loopRisk({
      market: input.market,
      collateralUsd: b.pledgedUsd,
      debtUsd: b.debtUsd,
      horizonDays: input.horizonDays,
      maxLeverage: GOVERNOR_MAX_LOOP_LEVERAGE,
    });
  }
  return unleveredRisk({
    asset: b.productiveUsd.gt(0) ? input.market.lstSymbol : 'USDC',
    protocol: b.productiveUsd.gt(0) ? input.market.protocol : input.market.usdcProtocol,
    network: b.productiveUsd.gt(0) ? input.market.network : input.market.usdcNetwork,
    directionalExposure: b.hedgeNotionalUsd.gt(0) ? ZERO : b.productiveUsd.gt(0) ? ONE : ZERO,
  });
}

function netUsd(b: Book): Decimal {
  return b.grossIncomeUsd.minus(b.financingUsd).minus(b.executionUsd).minus(b.expectedLossUsd);
}

function labelOf(kind: LegKind, input: ComparisonInput): string {
  const { market } = input;
  switch (kind) {
    case 'liquidity_reserve':
      return `Liquidity reserve (USDC on ${market.usdcProtocol})`;
    case 'productive_asset':
      return `Hold ${market.lstSymbol} (yield-bearing)`;
    case 'collateral_post':
      return `Post ${market.lstSymbol} as collateral`;
    case 'borrow':
      return `Borrow ${market.borrowSymbol} against collateral`;
    case 'redeploy_borrowed':
      return `Redeploy borrowed proceeds into ${market.lstSymbol}`;
    case 'hedge':
      return `Hedge ${market.lstSymbol} with ETH-PERP short`;
  }
}

function refreshLoss(input: ComparisonInput, b: Book): void {
  const risk = riskOf(input, b);
  const years = d(input.horizonDays).div(365);
  b.expectedLossUsd = years.gt(0)
    ? risk.expectedLiquidationLossUsd.div(years)
    : risk.expectedLiquidationLossUsd;
}

type ApplyResult =
  | {
      ok: true;
      book: Book;
      leg: Omit<StackLeg, 'id' | 'order' | 'marginalNetUsd' | 'marginalNetApy'>;
    }
  | { ok: false; reason: string };

function applyKind(input: ComparisonInput, book: Book, kind: LegKind): ApplyResult {
  const { market, capital, horizonDays, includeUnwindCosts } = input;
  const equity = ownerEquity(input);
  const next = clone(book);

  if (kind === 'liquidity_reserve') {
    if (book.reserveUsd.gt(0) && book.grossIncomeUsd.gt(0) && book.productiveUsd.eq(0)) {
      return { ok: false, reason: 'Reserve leg already present.' };
    }
    const income = capital.reserveUsd.mul(market.usdcSupplyApy);
    next.reserveUsd = capital.reserveUsd;
    next.grossIncomeUsd = income;
    const y = yieldStack({
      equityUsd: equity,
      grossIncomeUsd: income,
      financingUsd: ZERO,
      executionUsd: ZERO,
      expectedLossUsd: ZERO,
    });
    const risk = riskOf(input, next);
    return {
      ok: true,
      book: next,
      leg: {
        kind,
        label: labelOf(kind, input),
        assetSymbol: 'USDC',
        ownerEquityUsd: capital.reserveUsd,
        borrowedCapitalUsd: ZERO,
        notionalUsd: capital.reserveUsd,
        incomeUsd: income,
        financingUsd: ZERO,
        executionUsd: ZERO,
        expectedLossUsd: ZERO,
        estimatedNetUsd: y.estimatedNetUsd,
        estimatedNetApy: y.estimatedNetApy,
        healthFactor: risk.healthFactor,
        liquidationDistance: risk.liquidationDistance,
        leverage: leverageOf(next, equity),
        notes: [
          `Reserve is a stack leg, not a competing strategy. ${market.usdcSupplyApy.mul(100).toFixed(2)}% USDC supply (estimate).`,
        ],
      },
    };
  }

  if (kind === 'productive_asset') {
    if (next.productiveUsd.gt(0))
      return { ok: false, reason: 'Owner productive asset already on the stack.' };
    if (capital.investableUsd.lte(0)) {
      return { ok: false, reason: 'No investable capital after the liquidity reserve.' };
    }
    const ramp = cheapRampRoundTripUsd(capital.investableUsd, market);
    const gas = actionGasUsd(market.snapshot, market.network, 'swap').mul(2);
    const oneOff = ramp.plus(gas);
    const invested = max0(capital.investableUsd.minus(oneOff.div(2)));
    if (invested.lte(0)) return { ok: false, reason: 'Entry costs consume investable capital.' };
    const income = invested.mul(market.lstYieldApy);
    const exec = amortize(oneOff, horizonDays);
    next.productiveUsd = invested;
    next.grossIncomeUsd = next.grossIncomeUsd.plus(income);
    next.executionUsd = next.executionUsd.plus(exec);
    next.oneOffUsd = next.oneOffUsd.plus(oneOff);
    const breakdown = seedDepositBreakdown({
      seed: capital.deployableUsd,
      reserve: capital.reserveUsd,
      entryCosts: oneOff.div(2),
      ownerDeployed: invested,
      borrowed: ZERO,
      collateralCommitted: ZERO,
    });
    const risk = riskOf(input, next);
    const y = yieldStack({
      equityUsd: equity,
      grossIncomeUsd: income,
      financingUsd: ZERO,
      executionUsd: exec,
      expectedLossUsd: ZERO,
    });
    return {
      ok: true,
      book: next,
      leg: {
        kind,
        label: labelOf(kind, input),
        assetSymbol: market.lstSymbol,
        ownerEquityUsd: invested,
        borrowedCapitalUsd: ZERO,
        notionalUsd: invested,
        incomeUsd: income,
        financingUsd: ZERO,
        executionUsd: exec,
        expectedLossUsd: ZERO,
        estimatedNetUsd: y.estimatedNetUsd,
        estimatedNetApy: y.estimatedNetApy,
        healthFactor: risk.healthFactor,
        liquidationDistance: risk.liquidationDistance,
        leverage: leverageOf(next, equity),
        notes: [
          `${market.lstSymbol} yield ${market.lstYieldApy.mul(100).toFixed(2)}% (snapshot ${market.snapshotDate}). Same equity is not spent again when later posted as collateral.`,
          `Owner deployed ${breakdown.ownerCapital.toFixed(2)}; borrowed 0.`,
        ],
      },
    };
  }

  if (kind === 'collateral_post') {
    const unpledged = max0(next.productiveUsd.minus(next.pledgedUsd));
    if (unpledged.lte(EPS)) return { ok: false, reason: 'No unpledged productive asset to post.' };
    if (!capital.leverageAllowed) {
      return { ok: false, reason: 'Disclosures prohibit leverage; collateral post skipped.' };
    }
    const gas = ['approve', 'supply', 'setEMode']
      .map((a) => actionGasUsd(market.snapshot, market.network, a))
      .reduce((a, b) => a.plus(b), ZERO);
    const exec = amortize(gas, horizonDays);
    next.pledgedUsd = next.productiveUsd;
    next.executionUsd = next.executionUsd.plus(exec);
    next.oneOffUsd = next.oneOffUsd.plus(gas);
    const risk = riskOf(input, next);
    return {
      ok: true,
      book: next,
      leg: {
        kind,
        label: labelOf(kind, input),
        assetSymbol: market.lstSymbol,
        ownerEquityUsd: ZERO,
        borrowedCapitalUsd: ZERO,
        notionalUsd: unpledged,
        incomeUsd: ZERO,
        financingUsd: ZERO,
        executionUsd: exec,
        expectedLossUsd: ZERO,
        estimatedNetUsd: exec.neg(),
        estimatedNetApy: equity.gt(0) ? exec.neg().div(equity) : ZERO,
        healthFactor: risk.healthFactor,
        liquidationDistance: risk.liquidationDistance,
        leverage: leverageOf(next, equity),
        notes: [
          `Posts the same ${market.lstSymbol} already counted as the productive leg. Equity is not double-counted.`,
        ],
      },
    };
  }

  if (kind === 'borrow') {
    if (!capital.leverageAllowed) return { ok: false, reason: 'Disclosures prohibit leverage.' };
    if (next.pledgedUsd.lte(0)) return { ok: false, reason: 'No collateral posted.' };
    const ltvCap = max0(next.pledgedUsd.mul(market.ltv).minus(next.debtUsd));
    const hfCap = max0(
      next.pledgedUsd.mul(market.liquidationThreshold).div(TARGET_HF).minus(next.debtUsd),
    );
    const levCap = max0(
      equity.mul(GOVERNOR_MAX_LOOP_LEVERAGE).minus(next.productiveUsd).minus(next.idleBorrowedUsd),
    );
    const size = min(ltvCap, min(hfCap, levCap));
    if (size.lte(EPS))
      return { ok: false, reason: 'No borrow capacity inside LTV, target HF, and leverage cap.' };
    const loopGas = ['borrow', 'swap', 'supply']
      .map((a) => actionGasUsd(market.snapshot, market.network, a))
      .reduce((a, b) => a.plus(b), ZERO);
    const unwindGas = includeUnwindCosts
      ? ['swap', 'repay', 'withdraw']
          .map((a) => actionGasUsd(market.snapshot, market.network, a))
          .reduce((a, b) => a.plus(b), ZERO)
      : ZERO;
    const oneOff = loopGas.plus(unwindGas);
    const financing = size.mul(market.borrowApy);
    next.debtUsd = next.debtUsd.plus(size);
    next.idleBorrowedUsd = next.idleBorrowedUsd.plus(size);
    next.financingUsd = next.financingUsd.plus(financing);
    next.executionUsd = next.executionUsd.plus(amortize(oneOff, horizonDays));
    next.oneOffUsd = next.oneOffUsd.plus(oneOff);
    refreshLoss(input, next);
    const risk = riskOf(input, next);
    if (!risk.withinGovernorLimits) {
      return {
        ok: false,
        reason: `Borrow rejected by governor limits: ${risk.breaches.join('; ')}`,
      };
    }
    const y = yieldStack({
      equityUsd: equity,
      grossIncomeUsd: ZERO,
      financingUsd: financing,
      executionUsd: amortize(oneOff, horizonDays),
      expectedLossUsd: next.expectedLossUsd.minus(book.expectedLossUsd),
    });
    return {
      ok: true,
      book: next,
      leg: {
        kind,
        label: labelOf(kind, input),
        assetSymbol: market.borrowSymbol,
        ownerEquityUsd: ZERO,
        borrowedCapitalUsd: size,
        notionalUsd: size,
        incomeUsd: ZERO,
        financingUsd: financing,
        executionUsd: amortize(oneOff, horizonDays),
        expectedLossUsd: y.expectedLossUsd,
        estimatedNetUsd: y.estimatedNetUsd,
        estimatedNetApy: y.estimatedNetApy,
        healthFactor: risk.healthFactor,
        liquidationDistance: risk.liquidationDistance,
        leverage: leverageOf(next, equity),
        notes: [
          `Borrowed capital ${size.toFixed(2)} is not income. Target HF ${TARGET_HF.toFixed(2)}; LTV ${market.ltv.mul(100).toFixed(1)}%.`,
        ],
      },
    };
  }

  if (kind === 'redeploy_borrowed') {
    if (next.idleBorrowedUsd.lte(EPS))
      return { ok: false, reason: 'No idle borrowed proceeds to redeploy.' };
    const haircut = market.swapFeeWstEth.plus(market.swapImpactWstEth);
    const spent = next.idleBorrowedUsd;
    const invested = max0(spent.mul(ONE.minus(haircut)));
    const swapCost = spent.minus(invested);
    const gas = actionGasUsd(market.snapshot, market.network, 'swap').plus(
      actionGasUsd(market.snapshot, market.network, 'supply'),
    );
    const income = invested.mul(market.lstYieldApy);
    const exec = amortize(swapCost.plus(gas), horizonDays);
    next.idleBorrowedUsd = ZERO;
    next.productiveUsd = next.productiveUsd.plus(invested);
    next.grossIncomeUsd = next.grossIncomeUsd.plus(income);
    next.executionUsd = next.executionUsd.plus(exec);
    next.oneOffUsd = next.oneOffUsd.plus(swapCost.plus(gas));
    refreshLoss(input, next);
    const risk = riskOf(input, next);
    const y = yieldStack({
      equityUsd: equity,
      grossIncomeUsd: income,
      financingUsd: ZERO,
      executionUsd: exec,
      expectedLossUsd: ZERO,
    });
    return {
      ok: true,
      book: next,
      leg: {
        kind,
        label: labelOf(kind, input),
        assetSymbol: market.lstSymbol,
        ownerEquityUsd: ZERO,
        borrowedCapitalUsd: spent,
        notionalUsd: invested,
        incomeUsd: income,
        financingUsd: ZERO,
        executionUsd: exec,
        expectedLossUsd: ZERO,
        estimatedNetUsd: y.estimatedNetUsd,
        estimatedNetApy: y.estimatedNetApy,
        healthFactor: risk.healthFactor,
        liquidationDistance: risk.liquidationDistance,
        leverage: leverageOf(next, equity),
        notes: [
          `Redeploys borrowed ${market.borrowSymbol} into more ${market.lstSymbol}. Incremental income vs borrow cost is the leverage spread.`,
        ],
      },
    };
  }

  // hedge
  if (!capital.derivativesAllowed)
    return { ok: false, reason: 'Disclosures prohibit derivatives.' };
  const hl = market.hyperliquid;
  const unhedged = max0(next.productiveUsd.minus(next.hedgeNotionalUsd));
  if (unhedged.lte(EPS)) return { ok: false, reason: 'No unhedged productive exposure.' };
  const spareReserve = max0(next.reserveUsd.minus(capital.deployableUsd.mul('0.10')));
  const margin = min(spareReserve, unhedged.div(hl.governorMaxVenueLeverage));
  const short = unhedged;
  if (short.lt(hl.minOrderNotionalUsd)) {
    return {
      ok: false,
      reason: `Hedge notional ${short.toFixed(2)} below Hyperliquid min order ${hl.minOrderNotionalUsd.toFixed(2)}.`,
    };
  }
  if (margin.lt(hl.minDepositUsdc)) {
    return {
      ok: false,
      reason:
        'Not enough spare reserve for isolated-margin hedge without cutting the required reserve.',
    };
  }
  const venueLev = margin.gt(0) ? short.div(margin) : ZERO;
  if (venueLev.gt(hl.governorMaxVenueLeverage)) {
    return { ok: false, reason: `Venue leverage ${venueLev.toFixed(2)}x exceeds governor cap.` };
  }
  const openClose = short.mul(hl.takerFeeRate).mul(2);
  const funding = short.mul(hl.fundingApr);
  const exec = amortize(openClose.plus(hl.withdrawalFeeUsdc), horizonDays);
  next.hedgeNotionalUsd = short;
  next.hedgeMarginUsd = margin;
  next.grossIncomeUsd = next.grossIncomeUsd.plus(funding);
  next.executionUsd = next.executionUsd.plus(exec);
  next.oneOffUsd = next.oneOffUsd.plus(openClose);
  const risk = riskOf(input, next);
  const y = yieldStack({
    equityUsd: equity,
    grossIncomeUsd: funding,
    financingUsd: ZERO,
    executionUsd: exec,
    expectedLossUsd: ZERO,
  });
  return {
    ok: true,
    book: next,
    leg: {
      kind,
      label: labelOf(kind, input),
      assetSymbol: 'ETH-PERP',
      ownerEquityUsd: margin,
      borrowedCapitalUsd: ZERO,
      notionalUsd: short,
      incomeUsd: funding,
      financingUsd: ZERO,
      executionUsd: exec,
      expectedLossUsd: ZERO,
      estimatedNetUsd: y.estimatedNetUsd,
      estimatedNetApy: y.estimatedNetApy,
      healthFactor: risk.healthFactor,
      liquidationDistance: risk.hedgeLiquidationDistance,
      leverage: venueLev,
      notes: [
        `Optional hedge. Funding ${hl.fundingApr.mul(100).toFixed(2)}% APR (estimate; can reverse). Margin from spare reserve.`,
      ],
    },
  };
}

function projectRemaining(input: ComparisonInput, book: Book, remaining: LegKind[]): Book {
  let s = book;
  for (const k of remaining) {
    const r = applyKind(input, s, k);
    if (r.ok) s = r.book;
  }
  return s;
}

function finishLeg(
  partial: Omit<StackLeg, 'id' | 'order' | 'marginalNetUsd' | 'marginalNetApy'>,
  order: number,
  before: Book,
  after: Book,
  equity: Decimal,
): StackLeg {
  const marginalNetUsd = netUsd(after).minus(netUsd(before));
  const marginalNetApy = equity.gt(0) ? marginalNetUsd.div(equity) : ZERO;
  return {
    ...partial,
    id: `L${order}`,
    order,
    marginalNetUsd,
    marginalNetApy,
  };
}

/**
 * Greedy stack composer. Always starts with a liquidity-reserve leg. Adds the next
 * concurrent technique while the remaining feasible stack's incremental net on owner
 * equity still clears the configurable hurdle and governor limits.
 */
export function composeStack(input: ComparisonInput): CapitalStack {
  const equity = ownerEquity(input);
  const { market, capital, hurdleApy } = input;
  const warnings = [
    `Gross, estimated net, and risk figures are estimates from snapshot ${market.snapshotDate}. They are not realized returns and not a promise.`,
    'Hold liquid means a reserve-only stack, not a peer strategy identity.',
    ...capital.notes,
  ];

  let book = emptyBook(capital.reserveUsd, ZERO);
  const legs: StackLeg[] = [];
  const reserveApply = applyKind(input, book, 'liquidity_reserve');
  if (!reserveApply.ok) throw new Error(reserveApply.reason);
  const reserveLeg = finishLeg(reserveApply.leg, 1, book, reserveApply.book, equity);
  legs.push(reserveLeg);
  book = reserveApply.book;

  const remaining: LegKind[] = LEG_ORDER.filter((k) => k !== 'liquidity_reserve');
  let stopReason =
    'No further leg clears the hurdle after financing, execution, expected losses, and risk limits.';
  let nextProposed: ProposedStackLeg | null = null;

  while (remaining.length > 0) {
    const kind = remaining[0]!;
    const trial = applyKind(input, book, kind);
    if (!trial.ok) {
      remaining.shift();
      continue;
    }
    const projected = projectRemaining(input, book, [kind, ...remaining.slice(1)]);
    const incremental = equity.gt(0) ? netUsd(projected).minus(netUsd(book)).div(equity) : ZERO;
    const projRisk = riskOf(input, projected);
    if (!projRisk.withinGovernorLimits) {
      nextProposed = {
        kind,
        label: labelOf(kind, input),
        marginalNetApy: incremental,
        reason: `Projected stack breaches governor limits: ${projRisk.breaches.join('; ')}`,
      };
      stopReason = nextProposed.reason;
      break;
    }
    if (incremental.lt(hurdleApy)) {
      nextProposed = {
        kind,
        label: labelOf(kind, input),
        marginalNetApy: incremental,
        reason: `Remaining stack incremental net ${incremental.mul(100).toFixed(2)}% does not clear the ${hurdleApy.mul(100).toFixed(1)}% hurdle.`,
      };
      stopReason = nextProposed.reason;
      break;
    }
    const leg = finishLeg(trial.leg, legs.length + 1, book, trial.book, equity);
    legs.push(leg);
    book = trial.book;
    remaining.shift();
    nextProposed = null;
    stopReason = 'No further candidate legs.';
  }

  if (remaining.length === 0 && nextProposed === null) {
    stopReason =
      'Candidate legs exhausted (reserve, productive, collateral, borrow, redeploy, optional hedge).';
  }

  refreshLoss(input, book);
  const consolidated = yieldStack({
    equityUsd: equity,
    grossIncomeUsd: book.grossIncomeUsd,
    financingUsd: book.financingUsd,
    executionUsd: book.executionUsd,
    expectedLossUsd: book.expectedLossUsd,
  });
  const risk = riskOf(input, book);
  const reserveOnly = legs.length === 1 && legs[0]?.kind === 'liquidity_reserve';
  const clears = consolidated.estimatedNetApy.gte(hurdleApy) && !reserveOnly;
  const noDeployment = reserveOnly;
  const navUsd = navOf(book);

  return {
    snapshotDate: market.snapshotDate,
    hurdleApy,
    horizonDays: input.horizonDays,
    capital,
    seedUsd: capital.seedUsd,
    ownerEquityUsd: equity,
    borrowedCapitalUsd: book.debtUsd,
    reserveUsd: book.reserveUsd,
    productiveUsd: book.productiveUsd,
    collateralUsd: book.pledgedUsd,
    idleBorrowedUsd: book.idleBorrowedUsd,
    debtUsd: book.debtUsd,
    hedgeNotionalUsd: book.hedgeNotionalUsd,
    navUsd,
    healthFactor: risk.healthFactor,
    liquidationDistance: risk.liquidationDistance,
    leverage: leverageOf(book, equity),
    legs,
    consolidated,
    consolidatedNetApy: consolidated.estimatedNetApy,
    clearsHurdle: clears,
    noDeployment,
    recommendedAction: noDeployment ? 'hold_liquid' : 'operate_paper',
    stopReason,
    nextProposedLeg: noDeployment ? nextProposed : nextProposed,
    warnings,
  };
}

export function activeKindsOf(stack: CapitalStack): LegKind[] {
  return stack.legs.map((l) => l.kind);
}

export function nextLeg(stack: CapitalStack, active: readonly LegKind[]): StackLeg | null {
  const have = new Set(active);
  return stack.legs.find((l) => !have.has(l.kind)) ?? null;
}

export function riskAdjustedStackApy(stack: CapitalStack): Decimal {
  const risk = {
    healthFactor: stack.healthFactor,
    liquidationDistance: stack.liquidationDistance,
    hedgeLiquidationDistance: null,
    leverage: stack.leverage,
    ltv: stack.collateralUsd.gt(0) ? stack.debtUsd.div(stack.collateralUsd) : null,
    directionalExposure: stack.hedgeNotionalUsd.gt(0)
      ? ZERO
      : stack.productiveUsd.gt(0)
        ? ONE
        : ZERO,
    concentration: {
      byAsset: 'stack',
      byProtocol: 'stack',
      byNetwork: 'stack',
      assetShare: ONE,
      protocolShare: ONE,
    },
    smallPosition: false,
    fullyLiquidatableInOneCall: false,
    expectedLossUsd: stack.consolidated.expectedLossUsd,
    expectedLiquidationLossUsd: stack.consolidated.expectedLossUsd,
    breaches: [],
    withinGovernorLimits: true,
  };
  return riskAdjustedApy(stack.consolidatedNetApy, risk);
}
