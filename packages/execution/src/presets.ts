import { d } from '@shadow-banking/core';
import type { Proposal } from '@shadow-banking/risk';

export const PRESET_IDS = ['hold-liquid', 'loop-step', 'stack-step'] as const;
export type ExecutionPreset = (typeof PRESET_IDS)[number];

export function isExecutionPreset(raw: string): raw is ExecutionPreset {
  return (PRESET_IDS as readonly string[]).includes(raw);
}

/**
 * Paper/controller-shaped intents. `loop-step` still requires expectedNetReturn ≥ hurdle
 * (pass `--net 0.12`) or the governor vetoes — this is not a recommendation to deploy.
 */
export function presetProposal(preset: ExecutionPreset, net?: string): Proposal {
  if (preset === 'hold-liquid') {
    return {
      id: 'paper-hold',
      intents: [
        {
          id: 's0-hold',
          kind: 'hold',
          notionalUsd: d(1000),
          riskIncreasing: false,
          reducesRisk: false,
        },
      ],
    };
  }
  const ret = net !== undefined ? d(net) : undefined;
  const post = {
    healthFactor: d('1.90'),
    leverage: d('1.40'),
    reserveCoverage: d('1.50'),
  };
  return {
    id: 'paper-loop-step',
    intents: [
      {
        id: 's1-supply',
        kind: 'supply',
        venue: 'aave-v3',
        notionalUsd: d(400),
        riskIncreasing: true,
        loopSteps: 1,
        expectedPostState: post,
        ...(ret !== undefined ? { expectedNetReturn: ret } : {}),
      },
      {
        id: 's1-borrow',
        kind: 'borrow',
        venue: 'aave-v3',
        notionalUsd: d(120),
        riskIncreasing: true,
        loopSteps: 1,
        expectedPostState: post,
        ...(ret !== undefined ? { expectedNetReturn: ret } : {}),
      },
    ],
  };
}
