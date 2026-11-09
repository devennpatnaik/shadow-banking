import type { RecommendedAction } from './types.js';

export function actionCopy(action: RecommendedAction): string {
  switch (action) {
    case 'hold_liquid':
      return 'Hold liquid. No strategy clears the hurdle (or none is available). Do not deploy.';
    case 'operate_paper':
      return 'Paper only: a strategy may be modelled. Do not execute real transactions in Phases 1–4.';
    case 'add_reserves':
      return 'Caution: stop increasing leverage; add reserves or reduce risk.';
    case 'deleverage':
      return 'Deleveraging: repay debt / reduce exposure. Risk veto on new risk.';
    case 'unwind':
      return 'Emergency: safest feasible unwind to liquid form. Risk veto. Human acknowledgement required to reset.';
  }
}
