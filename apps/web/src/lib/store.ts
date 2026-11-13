import 'server-only';
import { randomUUID } from 'node:crypto';
import fixture from '../../data/market-snapshot-fixture.json';
import { sql } from './db';

export type ViewerSettings = {
  viewer_sub: string;
  seed_usd: string;
  hurdle: string;
  reserve_pct: string;
  updated_at: string;
};

export const FIXTURE_LABEL = 'fixture-2026-10-21';

export async function audit(
  viewerSub: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await sql(
    `insert into audit_events (id, viewer_sub, kind, payload) values ($1, $2, $3, $4::jsonb)`,
    [randomUUID(), viewerSub, kind, JSON.stringify(payload)],
  );
}

export async function getSettings(viewerSub: string): Promise<ViewerSettings> {
  const existing = await sql<ViewerSettings>(
    `select viewer_sub, seed_usd, hurdle, reserve_pct, updated_at::text as updated_at
     from viewer_settings where viewer_sub = $1`,
    [viewerSub],
  );
  const row = existing[0];
  if (row) return row;
  await sql(`insert into viewer_settings (viewer_sub) values ($1)`, [viewerSub]);
  const created = await sql<ViewerSettings>(
    `select viewer_sub, seed_usd, hurdle, reserve_pct, updated_at::text as updated_at
     from viewer_settings where viewer_sub = $1`,
    [viewerSub],
  );
  const first = created[0];
  if (!first) throw new Error('failed to create viewer_settings');
  await audit(viewerSub, 'settings_created', { seed_usd: first.seed_usd });
  return first;
}

export async function saveSettings(
  viewerSub: string,
  patch: { seed_usd: string; hurdle: string; reserve_pct: string },
): Promise<ViewerSettings> {
  await sql(
    `insert into viewer_settings (viewer_sub, seed_usd, hurdle, reserve_pct, updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (viewer_sub) do update set
       seed_usd = excluded.seed_usd,
       hurdle = excluded.hurdle,
       reserve_pct = excluded.reserve_pct,
       updated_at = now()`,
    [viewerSub, patch.seed_usd, patch.hurdle, patch.reserve_pct],
  );
  await audit(viewerSub, 'settings_updated', patch);
  return getSettings(viewerSub);
}

export async function ensureFixtureSnapshot(viewerSub: string): Promise<{
  id: string;
  label: string;
  body: unknown;
}> {
  const existing = await sql<{ id: string; label: string; body: unknown }>(
    `select id, label, body from market_snapshots
     where viewer_sub = $1 and label = $2
     order by created_at desc limit 1`,
    [viewerSub, FIXTURE_LABEL],
  );
  const hit = existing[0];
  if (hit) return hit;
  const id = randomUUID();
  await sql(
    `insert into market_snapshots (id, viewer_sub, label, body) values ($1, $2, $3, $4::jsonb)`,
    [id, viewerSub, FIXTURE_LABEL, JSON.stringify(fixture)],
  );
  await audit(viewerSub, 'snapshot_seeded', { label: FIXTURE_LABEL, sample: true });
  return { id, label: FIXTURE_LABEL, body: fixture };
}

export async function latestSnapshot(viewerSub: string): Promise<{
  id: string;
  label: string;
  body: unknown;
}> {
  await ensureFixtureSnapshot(viewerSub);
  const rows = await sql<{ id: string; label: string; body: unknown }>(
    `select id, label, body from market_snapshots
     where viewer_sub = $1
     order by created_at desc limit 1`,
    [viewerSub],
  );
  const row = rows[0];
  if (!row) throw new Error('no market snapshot');
  return row;
}

export type PaperRunRow = {
  id: string;
  viewer_sub: string;
  state: unknown;
  created_at: string;
  updated_at: string;
};

export async function insertPaperRun(viewerSub: string, state: unknown): Promise<PaperRunRow> {
  const id = randomUUID();
  await sql(`insert into paper_runs (id, viewer_sub, state) values ($1, $2, $3::jsonb)`, [
    id,
    viewerSub,
    JSON.stringify(state),
  ]);
  await audit(viewerSub, 'paper_run', { id });
  const rows = await sql<PaperRunRow>(
    `select id, viewer_sub, state, created_at::text as created_at, updated_at::text as updated_at
     from paper_runs where id = $1 and viewer_sub = $2`,
    [id, viewerSub],
  );
  const row = rows[0];
  if (!row) throw new Error('failed to persist paper run');
  return row;
}

export async function listPaperRuns(viewerSub: string): Promise<PaperRunRow[]> {
  return sql<PaperRunRow>(
    `select id, viewer_sub, state, created_at::text as created_at, updated_at::text as updated_at
     from paper_runs where viewer_sub = $1
     order by created_at desc limit 40`,
    [viewerSub],
  );
}

export type ProposalRow = {
  id: string;
  viewer_sub: string;
  body: unknown;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function insertProposal(
  viewerSub: string,
  id: string,
  body: unknown,
  status: string,
): Promise<ProposalRow> {
  await sql(`insert into proposals (id, viewer_sub, body, status) values ($1, $2, $3::jsonb, $4)`, [
    id,
    viewerSub,
    JSON.stringify(body),
    status,
  ]);
  await audit(viewerSub, 'proposal_created', { id, status });
  return getProposal(viewerSub, id);
}

export async function getProposal(viewerSub: string, id: string): Promise<ProposalRow> {
  const rows = await sql<ProposalRow>(
    `select id, viewer_sub, body, status, created_at::text as created_at, updated_at::text as updated_at
     from proposals where id = $1 and viewer_sub = $2`,
    [id, viewerSub],
  );
  const row = rows[0];
  if (!row) throw new Error('proposal not found');
  return row;
}

export async function listProposals(viewerSub: string): Promise<ProposalRow[]> {
  return sql<ProposalRow>(
    `select id, viewer_sub, body, status, created_at::text as created_at, updated_at::text as updated_at
     from proposals where viewer_sub = $1
     order by created_at desc limit 40`,
    [viewerSub],
  );
}

export async function updateProposal(
  viewerSub: string,
  id: string,
  body: unknown,
  status: string,
): Promise<ProposalRow> {
  await sql(
    `update proposals set body = $3::jsonb, status = $4, updated_at = now()
     where id = $1 and viewer_sub = $2`,
    [id, viewerSub, JSON.stringify(body), status],
  );
  await audit(viewerSub, 'proposal_updated', { id, status });
  return getProposal(viewerSub, id);
}
