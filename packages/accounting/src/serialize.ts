import { toJsonNumber, type Decimal } from '@shadow-banking/core';
import { ACCOUNT_IDS } from './chart.js';
import type { Ledger } from './ledger.js';
import type { AllocatorResult } from './allocate.js';
import type { PerformanceReport } from './performance.js';
import type { JournalEntry, JournalLine } from './types.js';

function dec(v: Decimal | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  return toJsonNumber(v);
}

export function lineToJson(line: JournalLine): Record<string, unknown> {
  return {
    account: line.account,
    side: line.side,
    amount: dec(line.amount),
    quantity: dec(line.quantity),
    instrumentId: line.instrumentId ?? null,
    venueAccountId: line.venueAccountId ?? null,
    holdingId: line.holdingId ?? null,
    memo: line.memo ?? null,
  };
}

export function entryToJson(entry: JournalEntry): Record<string, unknown> {
  return {
    id: entry.id,
    at: entry.at,
    category: entry.category,
    kind: entry.kind,
    source: entry.source,
    memo: entry.memo,
    lines: entry.lines.map(lineToJson),
    priceMark: dec(entry.priceMark),
    instrumentId: entry.instrumentId ?? null,
    intentHash: entry.intentHash ?? null,
  };
}

export function trialBalanceToJson(ledger: Ledger): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const id of ACCOUNT_IDS) out[id] = dec(ledger.balance(id));
  return out;
}

export function reportToJson(report: PerformanceReport): Record<string, unknown> {
  return {
    asOf: report.asOf,
    currency: report.currency,
    label: report.label,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    periodDays: report.periodDays,
    nav: dec(report.nav),
    grossAssets: dec(report.grossAssets),
    totalDebt: dec(report.totalDebt),
    equity: dec(report.equity),
    netContributedCapital: dec(report.netContributedCapital),
    initialEquity: dec(report.initialEquity),
    deposits: dec(report.deposits),
    withdrawals: dec(report.withdrawals),
    netPnl: dec(report.netPnl),
    realizedPnl: dec(report.realizedPnl),
    unrealizedPnl: dec(report.unrealizedPnl),
    realizedReturn: dec(report.realizedReturn),
    roie: dec(report.roie),
    roae: dec(report.roae),
    returnOnDeployedCapital: dec(report.returnOnDeployedCapital),
    periodReturn: dec(report.periodReturn),
    netAnnualizedYield: dec(report.netAnnualizedYield),
    netAnnualizedYieldKind: report.netAnnualizedYieldKind,
    annualizationAssumptions: report.annualizationAssumptions,
    grossAssetsToEquity: dec(report.grossAssetsToEquity),
    financingCosts: dec(report.financingCosts),
    income: {
      staking: dec(report.income.staking),
      lending: dec(report.income.lending),
      funding: dec(report.income.funding),
      lp: dec(report.income.lp),
      incentives: dec(report.income.incentives),
      realizedPnl: dec(report.income.realizedPnl),
    },
    expenses: {
      fees: dec(report.expenses.fees),
      financingCost: dec(report.expenses.financingCost),
      fundingExpense: dec(report.expenses.fundingExpense),
      liquidationLoss: dec(report.expenses.liquidationLoss),
      otherLoss: dec(report.expenses.otherLoss),
      operatingExpense: dec(report.expenses.operatingExpense),
    },
    liquidReserves: dec(report.liquidReserves),
    deployedCapital: dec(report.deployedCapital),
    maxDrawdown: dec(report.maxDrawdown),
    highWaterUnitNav: dec(report.highWaterUnitNav),
    liquidationExposure: {
      worstHealthFactor: dec(report.liquidationExposure.worstHealthFactor),
      worstLiquidationDistance: dec(report.liquidationExposure.worstLiquidationDistance),
      totalCollateral: dec(report.liquidationExposure.totalCollateral),
      totalDebt: dec(report.liquidationExposure.totalDebt),
    },
    hurdleApy: dec(report.hurdleApy),
    clearsHurdleOnAnnualizedEstimate: report.clearsHurdleOnAnnualizedEstimate,
    figuresNote: report.figuresNote,
  };
}

export function allocatorToJson(result: AllocatorResult): Record<string, unknown> {
  return {
    kind: result.kind,
    executes: result.executes,
    riskState: result.riskState,
    netEarnings: dec(result.netEarnings),
    totalAllocated: dec(result.totalAllocated),
    holdLiquid: result.holdLiquid,
    uses: result.uses.map((u) => ({
      use: u.use,
      amount: dec(u.amount),
      share: dec(u.share),
      reason: u.reason,
    })),
    notes: result.notes,
  };
}

export function ledgerToJson(ledger: Ledger): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: 'shadow-banking-ledger',
    meta: {
      currency: ledger.meta.currency,
      createdAt: ledger.meta.createdAt,
      label: ledger.meta.label,
      defaultHurdleApy: dec(ledger.meta.defaultHurdleApy),
      accounts: ledger.meta.accounts,
      instruments: Object.fromEntries(
        Object.entries(ledger.meta.instruments).map(([id, inst]) => [
          id,
          {
            ...inst,
            collateralParams: inst.collateralParams
              ? {
                  ltv: dec(inst.collateralParams.ltv),
                  liquidationThreshold: dec(inst.collateralParams.liquidationThreshold),
                  liquidationBonus: dec(inst.collateralParams.liquidationBonus),
                  eMode: inst.collateralParams.eMode,
                  eModeCategory: inst.collateralParams.eModeCategory ?? null,
                }
              : null,
          },
        ]),
      ),
    },
    trialBalance: trialBalanceToJson(ledger),
    nav: dec(ledger.nav()),
    entries: ledger.getEntries().map(entryToJson),
    holdings: ledger.getHoldings().map((h) => ({
      id: h.id,
      venueAccountId: h.venueAccountId,
      instrumentId: h.instrumentId,
      quantity: dec(h.quantity),
      costBasisUsd: dec(h.costBasisUsd),
      role: h.role,
      collateralPositionId: h.collateralPositionId ?? null,
    })),
    borrows: ledger.getBorrows().map((b) => ({
      id: b.id,
      venueAccountId: b.venueAccountId,
      instrumentId: b.instrumentId,
      principal: dec(b.principal),
      accruedInterest: dec(b.accruedInterest),
      apr: dec(b.apr),
      priceMark: dec(b.priceMark),
      venue: b.venue ?? null,
    })),
    snapshots: ledger.getSnapshots().map((s) => ({
      at: s.at,
      entryId: s.entryId,
      nav: dec(s.nav),
      shares: dec(s.shares),
      unitNav: dec(s.unitNav),
      grossAssets: dec(s.grossAssets),
      totalDebt: dec(s.totalDebt),
      deployed: dec(s.deployed),
      liquidReserves: dec(s.liquidReserves),
      netPnl: dec(s.netPnl),
      realizedPnl: dec(s.realizedPnl),
      unrealizedPnl: dec(s.unrealizedPnl),
    })),
  };
}
