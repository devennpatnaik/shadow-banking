import type { ComparisonInput, ComparisonResult, StrategyEvaluation } from './types.js';
import { EVALUATORS, STRATEGY_ORDER } from './candidates.js';

function better(a: StrategyEvaluation, b: StrategyEvaluation): StrategyEvaluation {
  if (a.portfolioClearsHurdle !== b.portfolioClearsHurdle) {
    return a.portfolioClearsHurdle ? a : b;
  }
  if (a.riskAdjustedApy.eq(b.riskAdjustedApy)) {
    return a.portfolioEstimatedNetUsd.gte(b.portfolioEstimatedNetUsd) ? a : b;
  }
  return a.riskAdjustedApy.gt(b.riskAdjustedApy) ? a : b;
}

/**
 * Compare every candidate on the same balance-sheet sleeve and market snapshot.
 * If nothing that is within governor limits clears the hurdle, recommend preserve-capital
 * even when preserve itself is below the hurdle (spec §5).
 */
export function compareStrategies(input: ComparisonInput): ComparisonResult {
  const warnings = [
    `Gross, estimated net, and risk figures are estimates from snapshot ${input.market.snapshotDate}. They are not realized returns and not a promise.`,
    ...input.capital.notes,
  ];
  const evaluations = STRATEGY_ORDER.map((id) => EVALUATORS[id](input));

  const eligible = evaluations.filter((e) => e.eligible && e.risk.withinGovernorLimits);
  const clearing = eligible.filter((e) => e.portfolioClearsHurdle && e.id !== 'preserve-liquid');
  const preserve = evaluations.find((e) => e.id === 'preserve-liquid');
  if (!preserve) throw new Error('preserve-liquid evaluation missing');

  if (clearing.length === 0) {
    const bestAnyway = eligible.reduce(better);
    const reasons = [
      `No eligible strategy clears the ${input.hurdleApy.mul(100).toFixed(1)}% annualized net hurdle after financing, execution, expected losses, and the liquidity reserve.`,
      `Best estimated net on deployable capital is ${bestAnyway.id} at ${bestAnyway.portfolioEstimatedNetApy.mul(100).toFixed(2)}% ($ ${bestAnyway.portfolioEstimatedNetUsd.toFixed(2)}/yr) — still below the hurdle.`,
      'Recommend preserve capital in liquid form rather than manufacturing yield through extra borrowing (spec §5).',
    ];
    if (
      preserve.yield.estimatedNetApy.gt(bestAnyway.portfolioEstimatedNetApy) ||
      bestAnyway.id === 'preserve-liquid'
    ) {
      reasons.push(
        `Preserve-liquid estimated net ${preserve.yield.estimatedNetApy.mul(100).toFixed(2)}%/yr with no liquidation path and no directional ETH exposure.`,
      );
    }
    return {
      snapshotDate: input.market.snapshotDate,
      hurdleApy: input.hurdleApy,
      horizonDays: input.horizonDays,
      capital: input.capital,
      evaluations,
      recommendation: {
        action: 'preserve-capital',
        strategyId: 'preserve-liquid',
        clearsHurdle: preserve.portfolioClearsHurdle,
        reasons,
      },
      warnings,
    };
  }

  const pick = clearing.reduce(better);
  return {
    snapshotDate: input.market.snapshotDate,
    hurdleApy: input.hurdleApy,
    horizonDays: input.horizonDays,
    capital: input.capital,
    evaluations,
    recommendation: {
      action: 'deploy',
      strategyId: pick.id,
      clearsHurdle: true,
      reasons: [
        `${pick.label} clears the ${input.hurdleApy.mul(100).toFixed(1)}% hurdle with estimated portfolio net ${pick.portfolioEstimatedNetApy.mul(100).toFixed(2)}%/yr ($ ${pick.portfolioEstimatedNetUsd.toFixed(2)}/yr).`,
        `Risk-adjusted APY ${pick.riskAdjustedApy.mul(100).toFixed(2)}%. These are estimates at snapshot ${input.market.snapshotDate}, not realized returns.`,
      ],
    },
    warnings,
  };
}

export function strategiesClearingHurdle(result: ComparisonResult): StrategyEvaluation[] {
  return result.evaluations.filter(
    (e) => e.eligible && e.risk.withinGovernorLimits && e.portfolioClearsHurdle,
  );
}
