import type { ExecutionProposal } from './types.js';

export function formatProposal(p: ExecutionProposal, path?: string): string {
  const lines = [
    `Assisted execution  ·  ${p.id}  ·  ${p.status}${p.veto ? '  ·  VETO' : ''}`,
    'Phase 5: propose + approve only. No live transactions.',
    '',
    `Risk state          ${p.riskState}`,
    `Governor            ${p.governorDecision}${p.veto ? ' (veto)' : ''}`,
    `Recommended         ${p.recommendedAction}`,
    `noDeployment        ${String(p.noDeployment)}`,
    `Hurdle              ${p.hurdle}`,
    `Actions             ${p.actions.length}`,
    `Simulator           ${p.simulation.simulator}  gas ${p.simulation.gasUsed}  (~$${p.simulation.estimatedGasUsd})`,
    `Policy              ${p.policy.ok ? 'ok' : 'REJECTED'}`,
    `NAV pre/post        ${p.accounting.pre.nav} / ${p.accounting.post.nav}`,
    `Debt pre/post       ${p.accounting.pre.debt} / ${p.accounting.post.debt}`,
    `Unwind              ${p.unwind.summary}`,
  ];
  if (path) lines.push(`File                ${path}`);
  lines.push('', 'Intents:');
  for (const i of p.intentProposal.intents) {
    lines.push(`  - ${i.id}  ${i.kind}  ${i.notionalUsd.toString()} USD`);
  }
  lines.push('', 'Actions:');
  for (const a of p.actions) {
    const call = a.calldata ? `${a.calldata.signature} → ${a.calldata.to}` : a.sdk.method;
    lines.push(`  - ${a.id}  ${a.venue}/${a.functionName}  ${call}`);
  }
  if (p.unwind.steps.length > 0) {
    lines.push('', 'Unwind plan:');
    for (const s of p.unwind.steps) {
      lines.push(`  ${s.order}. ${s.functionName} (${s.venue}) — ${s.note}`);
    }
  }
  lines.push('', p.userApproval.note);
  if (p.veto) {
    lines.push('RISK/POLICY VETO. Do not work around this. Exit 2.');
    for (const n of p.governorNotes) lines.push(`  ${n}`);
  }
  return lines.join('\n');
}

function field(file: Record<string, unknown>, key: string, fallback: string): string {
  const v = file[key];
  return typeof v === 'string' ? v : fallback;
}

export function formatStored(file: Record<string, unknown>, path?: string): string {
  const lines = [
    `Assisted execution  ·  ${field(file, 'id', '?')}  ·  ${field(file, 'status', '?')}`,
    `veto ${file['veto'] === true ? 'YES' : 'no'}  risk ${field(file, 'riskState', '')}`,
    `approve does not broadcast. broadcast is forbidden.`,
  ];
  if (path) lines.push(path);
  return lines.join('\n');
}
