-- Ariel's official weekly work programs: source evidence is not an OT.
-- New source versions are immutable; current flags retire prior versions without deletion.
create table if not exists public.planning_weekly_work_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_file text not null,
  source_sha256 text not null,
  source_sheet text not null,
  gmail_message_id text,
  source_url text,
  mine text not null,
  week_start date not null,
  week_end date not null,
  reported_at timestamptz,
  source_owner text not null default 'Ariel López',
  status text not null default 'official_source'
    check (status in ('official_source','archived','review_required')),
  is_current boolean not null default false,
  imported_at timestamptz not null default now(),
  unique (organization_id, source_sha256, source_sheet),
  check (week_end >= week_start)
);
create unique index if not exists planning_weekly_source_one_current_per_mine
  on public.planning_weekly_work_sources (organization_id, mine) where is_current;
create index if not exists planning_weekly_work_sources_recent
  on public.planning_weekly_work_sources (organization_id, is_current, reported_at desc);

create table if not exists public.planning_weekly_work_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references public.planning_weekly_work_sources(id) on delete restrict,
  source_row integer not null check (source_row > 0),
  activity_number text,
  planned_date date,
  shift_name text,
  assigned_name text,
  asset_label text not null,
  canonical_asset_id uuid references canonical.assets(id) on delete set null,
  title text not null,
  work_type_raw text,
  priority_raw text,
  planned_hours numeric check (planned_hours is null or planned_hours >= 0),
  reported_hours numeric check (reported_hours is null or reported_hours >= 0),
  source_status text,
  source_progress numeric check (source_progress is null or (source_progress >= 0 and source_progress <= 1)),
  execution_date date,
  observations text,
  materials text,
  source_payload jsonb not null default '{}'::jsonb,
  row_hash text not null,
  reconciliation_status text not null default 'review_required'
    check (reconciliation_status in ('matched','review_required','ambiguous')),
  review_reason text,
  linked_work_order_id uuid references public.maintenance_work_orders(id) on delete set null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id,source_row)
);
create index if not exists planning_weekly_work_items_source
  on public.planning_weekly_work_items (organization_id,source_id,planned_date);
create index if not exists planning_weekly_work_items_asset
  on public.planning_weekly_work_items (organization_id,canonical_asset_id,planned_date)
  where canonical_asset_id is not null;

-- The application uses a server-side service role client after authenticating
-- the user and enforcing organization_id; direct client reads remain denied.
alter table public.planning_weekly_work_sources enable row level security;
alter table public.planning_weekly_work_items enable row level security;
revoke all on public.planning_weekly_work_sources from anon, authenticated;
revoke all on public.planning_weekly_work_items from anon, authenticated;
grant select,insert,update on public.planning_weekly_work_sources to service_role;
grant select,insert,update on public.planning_weekly_work_items to service_role;