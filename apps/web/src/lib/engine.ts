import 'server-only';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  balanceSheetReport,
  d,
  formatMoney,
  formatPct,
  usesOfCapital,
  type BalanceSheet,
} from '@shadow-banking/core';
import { paperRunToJson, runPaper, seedIdlePaperLedger } from '@shadow-banking/controller';
import {
  applyApprove,
  applyReject,
  isExecutionPreset,
  presetProposal,
  proposeExecution,
  proposalToJson,
} from '@shadow-banking/execution';
import {
  actionCopy,
  evaluateGovernorSnapshot,
  paperDisclosure,
  snapshotFromBook,
} from '@shadow-banking/risk';
import {
  composeStack,
  parseSnapshot,
  resolveCapital,
  resolveMarket,
  stackToJson,
} from '@shadow-banking/strategy';
import {
  getProposal,
  getSettings,
  insertPaperRun,
  insertProposal,
  latestSnapshot,
  listPaperRuns,
  listProposals,
  saveSettings,
  updateProposal,
  type ViewerSettings,
} from './store';

export const PAPER_BANNER = {
  paper: true,
  execution: 'propose_only',
  phase: '5',
  signingKeys: false,
  liveTransactions: false,
  broadcast: false,
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function idleBook(settings: ViewerSettings): BalanceSheet {
  return seedIdlePaperLedger({
    asOf: '2026-10-21T00:00:00Z',
    seedUsd: d(settings.seed_usd),
    hurdleApy: d(settings.hurdle),
    reserveRate: d(settings.reserve_pct),
  }).toBalanceSheet();
}

export async function composeViewerStack(viewerSub: string) {
  const settings = await getSettings(viewerSub);
  const snap = await latestSnapshot(viewerSub);
  const marketFile = parseSnapshot(snap.body);
  const seed = d(settings.seed_usd);
  const hurdle = d(settings.hurdle);
  const market = resolveMarket({
    snapshot: marketFile,
    seedUsd: seed,
    hurdleApy: hurdle,
  });
  const capital = resolveCapital({
    seedUsd: seed,
    hurdleApy: hurdle,
    reserveRate: d(settings.reserve_pct),
  });
  return {
    settings,
    snap,
    stack: composeStack({
      market,
      capital,
      hurdleApy: hurdle,
      horizonDays: 365,
      includeUnwindCosts: true,
      hedgedLongShare: d('0.60'),
    }),
  };
}

export async function homePayload(viewerSub: string) {
  const { settings, snap, stack } = await composeViewerStack(viewerSub);
  const book = idleBook(settings);
  const disclosure = paperDisclosure();
  const gov = snapshotFromBook(book, disclosure, { hurdle: d(settings.hurdle) });
  const evaln = evaluateGovernorSnapshot(gov, { noDeployment: stack.noDeployment });
  const report = balanceSheetReport(book);
  const uses = usesOfCapital(book);
  return {
    ...PAPER_BANNER,
    ok: !evaln.veto,
    command: 'status',
    market: {
      label: snap.label,
      sample: snap.label.startsWith('fixture'),
      note: 'Fixture market snapshot (sample). Not a live feed.',
    },
    nav: report.equity.toString(),
    equity: report.equity.toString(),
    debt: report.totalLiabilities.toString(),
    reserves: report.reserveHeld.toString(),
    healthFactor: report.worstHealthFactor?.toString() ?? null,
    hurdle: settings.hurdle,
    seed: settings.seed_usd,
    reservePct: settings.reserve_pct,
    riskState: evaln.state,
    veto: evaln.veto,
    recommendedAction: evaln.recommendedAction,
    noDeployment: evaln.noDeployment || stack.noDeployment,
    actionCopy: actionCopy(evaln.recommendedAction),
    formatted: {
      nav: formatMoney(report.equity),
      equity: formatMoney(report.equity),
      debt: formatMoney(report.totalLiabilities),
      reserves: formatMoney(report.reserveHeld),
      hurdle: formatPct(d(settings.hurdle)),
    },
    uses: {
      note: uses.note,
      ownerEquityUsd: uses.ownerEquityUsd.toString(),
      borrowedCapitalUsd: uses.borrowedCapitalUsd.toString(),
      assets: uses.assets.map((a) => ({
        holdingId: a.holdingId,
        symbol: a.symbol,
        fairValue: a.fairValue.toString(),
        ownerEquityUsd: a.ownerEquityUsd.toString(),
        borrowedUsd: a.borrowedUsd.toString(),
        uses: a.uses,
        formattedValue: formatMoney(a.fairValue),
      })),
    },
    stack: stackToJson(stack),
  };
}

export async function stackPayload(viewerSub: string) {
  const { settings, snap, stack } = await composeViewerStack(viewerSub);
  return {
    ...PAPER_BANNER,
    ok: true,
    command: 'stack',
    market: {
      label: snap.label,
      sample: snap.label.startsWith('fixture'),
      note: 'Fixture market snapshot (sample). Estimates, not realized returns.',
    },
    settings: {
      seed_usd: settings.seed_usd,
      hurdle: settings.hurdle,
      reserve_pct: settings.reserve_pct,
    },
    stack: stackToJson(stack),
  };
}

export async function runViewerPaper(viewerSub: string, steps: number) {
  const settings = await getSettings(viewerSub);
  const snap = await latestSnapshot(viewerSub);
  const dir = mkdtempSync(join(tmpdir(), 'sb-web-paper-'));
  const snapshotPath = join(dir, 'snapshot.json');
  writeFileSync(snapshotPath, JSON.stringify(snap.body));
  const result = runPaper({
    steps,
    seedUsd: d(settings.seed_usd),
    hurdleApy: d(settings.hurdle),
    reserveRate: d(settings.reserve_pct),
    snapshotPath,
    provider: 'fixture',
    stateDir: dir,
  });
  const json = paperRunToJson(result);
  const row = await insertPaperRun(viewerSub, json);
  return { row, json };
}

export async function createViewerProposal(viewerSub: string, preset: string) {
  if (!isExecutionPreset(preset)) {
    throw new Error(`unknown preset ${preset}`);
  }
  const settings = await getSettings(viewerSub);
  const proposal = proposeExecution({
    proposal: presetProposal(preset),
    fixture: 'normal',
    hurdle: settings.hurdle,
    noDeployment: preset === 'hold-liquid',
  });
  const body = proposalToJson(proposal);
  const status = String(body['status'] ?? proposal.status);
  const id = String(body['id'] ?? proposal.id);
  const row = await insertProposal(viewerSub, id, body, status);
  return { row, body };
}

export async function decideProposal(
  viewerSub: string,
  id: string,
  decision: 'approve' | 'reject',
) {
  const row = await getProposal(viewerSub, id);
  const file = asRecord(row.body);
  const next = decision === 'approve' ? applyApprove(file) : applyReject(file);
  const status = String(next['status'] ?? (decision === 'approve' ? 'approved' : 'rejected'));
  const updated = await updateProposal(viewerSub, id, next, status);
  return { row: updated, body: next };
}

export async function updateViewerSettings(
  viewerSub: string,
  input: { seedUsd: string; hurdlePct: string; reservePct: string },
) {
  const seed = d(input.seedUsd);
  if (!seed.isFinite() || seed.lte(0)) throw new Error('seed must be > 0');
  const hurdlePct = d(input.hurdlePct);
  const reservePct = d(input.reservePct);
  if (hurdlePct.lte(0) || hurdlePct.gt(100)) throw new Error('hurdle must be in (0, 100]');
  if (reservePct.lt(0) || reservePct.gte(100)) throw new Error('reserve must be in [0, 100)');
  return saveSettings(viewerSub, {
    seed_usd: seed.toString(),
    hurdle: hurdlePct.div(100).toString(),
    reserve_pct: reservePct.div(100).toString(),
  });
}

export async function paperList(viewerSub: string) {
  return listPaperRuns(viewerSub);
}

export async function proposalList(viewerSub: string) {
  return listProposals(viewerSub);
}

export { getSettings };
