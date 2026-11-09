import { d, type Decimal, type DisclosureProfile } from '@shadow-banking/core';
import type { MarketSnapshotFile } from '@shadow-banking/simulator';
import {
  compareStrategies,
  resolveCapital,
  resolveMarket,
  type ComparisonResult,
  type FundingBasis,
} from '@shadow-banking/strategy';
import type { Ledger } from '@shadow-banking/accounting';

export function evaluatePaperStrategies(args: {
  snapshot: MarketSnapshotFile;
  seedUsd: Decimal;
  hurdleApy: Decimal;
  network: string;
  lstSymbol: string;
  borrowSymbol: string;
  fundingBasis: FundingBasis;
  reserveRate: Decimal;
  disclosure?: DisclosureProfile;
  ledger?: Ledger;
}): ComparisonResult {
  const market = resolveMarket({
    snapshot: args.snapshot,
    network: args.network,
    lstSymbol: args.lstSymbol,
    borrowSymbol: args.borrowSymbol,
    seedUsd: args.seedUsd,
    fundingBasis: args.fundingBasis,
    hurdleApy: args.hurdleApy,
  });
  const capitalArgs: Parameters<typeof resolveCapital>[0] = {
    seedUsd: args.seedUsd,
    hurdleApy: args.hurdleApy,
    reserveRate: args.reserveRate,
  };
  if (args.disclosure) capitalArgs.disclosure = args.disclosure;
  if (args.ledger) capitalArgs.balanceSheet = args.ledger.toBalanceSheet();
  const capital = resolveCapital(capitalArgs);
  return compareStrategies({
    market,
    capital,
    hurdleApy: args.hurdleApy,
    horizonDays: 365,
    includeUnwindCosts: true,
    hedgedLongShare: d('0.60'),
    ...(args.disclosure ? { disclosure: args.disclosure } : {}),
  });
}
