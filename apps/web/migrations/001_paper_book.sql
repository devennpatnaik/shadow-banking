create table if not exists viewer_settings (
  viewer_sub text primary key,
  seed_usd text not null default '1000',
  hurdle text not null default '0.1',
  reserve_pct text not null default '0.20',
  updated_at timestamptz not null default now()
);

create table if not exists market_snapshots (
  id text primary key,
  viewer_sub text not null,
  label text not null,
  body jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists market_snapshots_viewer_created_idx
  on market_snapshots (viewer_sub, created_at desc);

create table if not exists paper_runs (
  id text primary key,
  viewer_sub text not null,
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists paper_runs_viewer_created_idx
  on paper_runs (viewer_sub, created_at desc);

create table if not exists proposals (
  id text primary key,
  viewer_sub text not null,
  body jsonb not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposals_viewer_created_idx
  on proposals (viewer_sub, created_at desc);

create table if not exists audit_events (
  id text primary key,
  viewer_sub text not null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_viewer_created_idx
  on audit_events (viewer_sub, created_at desc);
