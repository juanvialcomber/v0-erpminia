create table if not exists public.maintenance_meter_review_queue (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 canonical_asset_id uuid not null references canonical.assets(id) on delete restrict,
 submitted_hours numeric(14,2) not null,
 previous_hours numeric(14,2),
 previous_recorded_at timestamptz,
 attempted_at timestamptz not null default now(),
 attempted_by uuid,
 reason text not null check (reason in ('meter_decrease','non_increasing_timestamp','physically_impossible_increase','invalid_reading')),
 evidence_path text,
 status text not null default 'pending' check (status in ('pending','resolved')),
 resolved_at timestamptz,
 resolved_by uuid,
 resolution_notes text
);
create index if not exists maintenance_meter_review_pending_idx on public.maintenance_meter_review_queue (organization_id,status,attempted_at desc);
alter table public.maintenance_meter_review_queue enable row level security;
revoke all on public.maintenance_meter_review_queue from public,anon,authenticated;
grant select,insert,update on public.maintenance_meter_review_queue to service_role;
