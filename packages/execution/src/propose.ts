import { createHash } from 'node:crypto';
import {
  evaluateProposal,
  observationFromBook,
  observationFromFlat,
  hydrateGovernorSnapshot,
  looksLikeBalanceSheet,
  hydrateBalanceSheet,
  paperDisclosure,
  fixtureBook,
  type FixtureName,
  type GovernorSnapshot,
  type Proposal,
} from '@shadow-banking/risk';
import { d } from '@shadow-banking/core';
import { constructActions, type ConstructOptions } from './construct.js';
import { accountingImpact } from './impact.js';
import { checkPolicy, defaultPolicy } from './policy.js';
import { mockSimulate } from './simulate.js';
import type { SimulationBundle } from './types.js';
import type { ExecutionPolicyConfig, ExecutionProposal, ExecutionStatus } from './types.js';
import { unwindPlan } from './unwind.js';

export interface ProposeInput {
  proposal: Proposal;
  snapshot?: GovernorSnapshot;
  bookRaw?: unknown;
  fixture?: FixtureName;
  hurdle?: string;
  simulation?: SimulationBundle;
  policy?: ExecutionPolicyConfig;
  construct?: ConstructOptions;
  now?: string;
  noDeployment?: boolean;
}

function idFor(proposal: Proposal): string {
  const h = createHash('sha256')
    .update(JSON.stringify({ id: proposal.id, intents: proposal.intents.map((i) => i.id) }))
    .digest('hex')
    .slice(0, 12);
  return `exec-${h}`;
}

function loadObs(input: ProposeInput) {
  const hurdle = input.hurdle ? d(input.hurdle) : undefined;
  const disc = paperDisclosure();
  if (input.fixture) {
    return observationFromBook(fixtureBook(input.fixture), disc, hurdle ? { hurdle } : {});
  }
  if (input.bookRaw) {
    if (looksLikeBalanceSheet(input.bookRaw)) {
      return observationFromBook(
        hydrateBalanceSheet(input.bookRaw),
        disc,
        hurdle ? { hurdle } : {},
      );
    }
    return observationFromFlat(hydrateGovernorSnapshot(input.bookRaw));
  }
  if (input.snapshot) return observationFromFlat(input.snapshot);
  return observationFromBook(fixtureBook('normal'), disc, hurdle ? { hurdle } : {});
}

export function proposeExecution(input: ProposeInput): ExecutionProposal {
  const now = input.now ?? new Date().toISOString();
  const obs = loadObs(input);
  if (input.hurdle) obs.hurdle = d(input.hurdle);
  const actions = constructActions(input.proposal.intents, input.construct ?? {});
  const simulation = input.simulation ?? mockSimulate(actions);
  const accounting = accountingImpact(obs, actions);
  const unwind = unwindPlan(actions);
  const policy = checkPolicy(actions, input.policy ?? defaultPolicy());
  const holdOnly = input.proposal.intents.every((i) => i.kind === 'hold');
  const evaln = evaluateProposal(obs, input.proposal, {
    noDeployment: input.noDeployment ?? holdOnly,
  });
  const veto = evaln.veto || !policy.ok;
  const status: ExecutionStatus = veto ? 'vetoed' : 'draft';
  const notes = [...evaln.notes];
  if (!policy.ok) notes.push('Policy stub rejected this proposal (allowlist or spending cap).');

  return {
    id: idFor(input.proposal),
    status,
    createdAt: now,
    updatedAt: now,
    approvedAt: null,
    rejectedAt: null,
    intentProposal: input.proposal,
    actions,
    simulation,
    accounting,
    unwind,
    policy,
    riskState: evaln.state,
    recommendedAction: evaln.recommendedAction,
    noDeployment: evaln.noDeployment,
    hurdle: evaln.hurdle.toString(),
    veto,
    governorDecision: evaln.decision,
    governorIntents: evaln.intents,
    governorNotes: notes,
    userApproval: {
      required: true,
      boundToId: idFor(input.proposal),
      broadcasts: false,
      note: 'Phase 5: approve marks the file only. It does not sign or broadcast.',
    },
  };
}
