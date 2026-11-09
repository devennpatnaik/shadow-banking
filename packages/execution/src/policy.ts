import { d } from '@shadow-banking/core';
import { AAVE_V3_ETHEREUM, SELECTORS, SIGNATURES } from './addresses.js';
import type { ExecutionPolicyConfig, PolicyCheck, ProposedAction } from './types.js';

function norm(addr: string): string {
  return addr.toLowerCase();
}

export function defaultPolicy(): ExecutionPolicyConfig {
  return {
    allowlistEnabled: true,
    spendingEnabled: true,
    allowedTargets: Object.values(AAVE_V3_ETHEREUM).map(norm),
    allowedSignatures: [...Object.values(SIGNATURES), ...Object.values(SELECTORS)],
    allowedVenues: ['aave-v3', 'hyperliquid', 'none'],
    perTxUsdMax: d(500),
    perDayUsdMax: d(1000),
    spentTodayUsd: d(0),
  };
}

export function checkPolicy(
  actions: readonly ProposedAction[],
  config: ExecutionPolicyConfig = defaultPolicy(),
): PolicyCheck {
  const reasons: string[] = [];
  let allowlistOk = true;
  let spendingOk = true;
  let day = config.spentTodayUsd;

  for (const a of actions) {
    if (config.allowlistEnabled) {
      if (!config.allowedVenues.includes(a.venue)) {
        allowlistOk = false;
        reasons.push(`venue ${a.venue} is not on the allowlist`);
      }
      if (a.calldata) {
        const to = norm(a.calldata.to);
        if (!config.allowedTargets.includes(to)) {
          allowlistOk = false;
          reasons.push(`${a.id}: target ${a.calldata.to} is not allowlisted`);
        }
        const sel = a.calldata.selector.toLowerCase();
        const sigOk =
          config.allowedSignatures.some((s) => s.toLowerCase() === sel) ||
          config.allowedSignatures.includes(a.calldata.signature);
        if (!sigOk) {
          allowlistOk = false;
          reasons.push(`${a.id}: selector ${a.calldata.selector} is not allowlisted`);
        }
      }
    }
    if (config.spendingEnabled && a.functionName !== 'hold' && a.functionName !== 'approve') {
      if (a.notionalUsd.gt(config.perTxUsdMax)) {
        spendingOk = false;
        reasons.push(
          `${a.id}: notional ${a.notionalUsd.toString()} exceeds per-tx cap ${config.perTxUsdMax.toString()}`,
        );
      }
      day = day.plus(a.notionalUsd);
      if (day.gt(config.perDayUsdMax)) {
        spendingOk = false;
        reasons.push(
          `${a.id}: would breach per-day cap ${config.perDayUsdMax.toString()} (running ${day.toString()})`,
        );
      }
    }
  }

  if (allowlistOk && spendingOk) {
    reasons.push('Allowlist and spending stubs passed (not a live signer policy).');
  }

  return {
    ok: allowlistOk && spendingOk,
    allowlistOk,
    spendingOk,
    reasons,
    config: {
      allowlistEnabled: config.allowlistEnabled,
      spendingEnabled: config.spendingEnabled,
      perTxUsdMax: config.perTxUsdMax.toString(),
      perDayUsdMax: config.perDayUsdMax.toString(),
    },
  };
}
