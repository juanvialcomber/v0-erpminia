create table if not exists public.maintenance_meter_asset_assignments (
  organization_id uuid not null,
  user_id uuid not null,
  canonical_asset_id uuid not null references canonical.assets(id) on delete restrict,
  assigned_by uuid,
  assigned_at timestamptz not null default now(),
  primary key (organization_id,user_id,canonical_asset_id)
);
create index if not exists maintenance_meter_assignments_asset_idx on public.maintenance_meter_asset_assignments (organization_id,canonical_asset_id);
alter table public.maintenance_meter_asset_assignments enable row level security;
revoke all on public.maintenance_meter_asset_assignments from public,anon,authenticated;
grant select,insert,delete on public.maintenance_meter_asset_assignments to service_role;
