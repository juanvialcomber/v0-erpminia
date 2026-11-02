-- Daily reported availability snapshots for MOTIL.
-- This is intentionally separate from canonical.asset_availability_daily, which
-- requires real scheduled minutes and is reserved for time-based availability V2.

create table if not exists public.maintenance_reported_availability_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  mine text not null,
  reported_date date not null,
  source_manifest_id uuid references public.motil_email_source_manifest(id) on delete restrict,
  source_file text not null,
  source_sha256 text not null,
  source_sheet text not null default 'Reporte Diario',
  gmail_message_id text,
  source_url text,
  received_at timestamptz,
  source_owner text,
  status text not null default 'official_source'
    check (status in ('official_source','archived','review_required')),
  is_current boolean not null default true,
  imported_at timestamptz not null default now(),
  unique (organization_id, source_sha256, source_sheet)
);

create unique index if not exists maintenance_reported_availability_one_current_per_day
  on public.maintenance_reported_availability_sources (organization_id, mine, reported_date)
  where is_current;

create index if not exists maintenance_reported_availability_sources_recent
  on public.maintenance_reported_availability_sources (organization_id, mine, reported_date desc, is_current);

create table if not exists public.maintenance_reported_availability_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references public.maintenance_reported_availability_sources(id) on delete restrict,
  source_row integer not null check (source_row > 0),
  raw_asset_name text not null,
  canonical_asset_id uuid references canonical.assets(id) on delete set null,
  raw_status text not null,
  normalized_state text not null
    check (normalized_state in ('available','unavailable','standby','unknown')),
  availability_classification text not null
    check (availability_classification in ('available','unavailable','excluded','review_required')),
  downtime_kind text
    check (downtime_kind is null or downtime_kind in ('planned','unplanned','unknown')),
  meter_unit text,
  meter_value numeric,
  detail text,
  work_performed text,
  part_required text,
  responsible text,
  planning_observation text,
  cost_center_raw text,
  source_payload jsonb not null default '{}'::jsonb,
  row_hash text not null,
  reconciliation_status text not null default 'review_required'
    check (reconciliation_status in ('matched','review_required','ambiguous')),
  reconciliation_method text,
  review_reason text,
  validation_status text not null default 'valid'
    check (validation_status in ('valid','review','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, source_row),
  unique (organization_id, row_hash)
);

create index if not exists maintenance_reported_availability_rows_asset_date
  on public.maintenance_reported_availability_rows (organization_id, canonical_asset_id, source_id)
  where canonical_asset_id is not null;

create index if not exists maintenance_reported_availability_rows_review
  on public.maintenance_reported_availability_rows (organization_id, reconciliation_status, availability_classification);

-- Server-side application access only. User/module authorization is enforced
-- before the service-role client queries these tables.
alter table public.maintenance_reported_availability_sources enable row level security;
alter table public.maintenance_reported_availability_rows enable row level security;
revoke all on public.maintenance_reported_availability_sources from anon, authenticated;
revoke all on public.maintenance_reported_availability_rows from anon, authenticated;
grant select, insert, update on public.maintenance_reported_availability_sources to service_role;
grant select, insert, update on public.maintenance_reported_availability_rows to service_role;

create or replace view public.maintenance_reported_availability_daily_v1
with (security_invoker = true) as
select
  s.organization_id,
  s.id as source_id,
  s.mine,
  s.reported_date,
  s.source_manifest_id,
  s.source_file,
  s.source_sha256,
  s.gmail_message_id,
  s.received_at,
  r.id as row_id,
  r.source_row,
  r.canonical_asset_id,
  a.asset_code,
  a.name as asset_name,
  a.asset_type,
  a.category,
  a.location,
  a.criticality,
  r.raw_asset_name,
  r.raw_status,
  r.normalized_state,
  r.availability_classification,
  case when r.availability_classification = 'available' then 1
       when r.availability_classification = 'unavailable' then 0
       else null end as availability_numerator,
  case when r.availability_classification in ('available','unavailable') then 1
       else 0 end as availability_denominator,
  r.downtime_kind,
  r.meter_unit,
  r.meter_value,
  r.detail,
  r.work_performed,
  r.part_required,
  r.responsible,
  r.planning_observation,
  r.reconciliation_status,
  r.reconciliation_method,
  r.review_reason,
  r.validation_status
from public.maintenance_reported_availability_sources s
join public.maintenance_reported_availability_rows r
  on r.source_id = s.id
 and r.organization_id = s.organization_id
left join canonical.assets a
  on a.id = r.canonical_asset_id
 and a.organization_id = r.organization_id
where s.is_current = true
  and s.status = 'official_source'
  and r.validation_status <> 'rejected';

grant select on public.maintenance_reported_availability_daily_v1 to service_role;

comment on view public.maintenance_reported_availability_daily_v1 is
  'V1 reported availability from daily equipment snapshots. Denominator is classified daily observations, not scheduled minutes. STANDBY remains review_required until operational semantics are approved.';
