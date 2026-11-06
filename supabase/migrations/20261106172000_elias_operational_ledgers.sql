begin;

create table if not exists public.mining_properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  representative_name text not null,
  property_name text not null,
  patent_value_clp numeric(18,2),
  source_file text not null,
  source_sheet text not null,
  source_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, representative_name, property_name)
);

create table if not exists public.mining_property_royalties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mining_property_id uuid not null references public.mining_properties(id) on delete cascade,
  lot_ref text,
  event_date date,
  tonnes numeric(18,3),
  cu_grade_pct numeric(10,4),
  net_clp numeric(18,2),
  royalty_clp numeric(18,2),
  payment_status text not null default 'unknown' check (payment_status in ('paid','unpaid','partial','unknown')),
  payment_note text,
  destination text,
  notes text,
  source_file text not null,
  source_sheet text not null,
  source_row integer not null,
  source_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, source_fingerprint)
);

create table if not exists public.transport_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  carrier_name text not null,
  period_start date not null,
  period_end date not null,
  settlement_type text not null default 'final',
  gross_payable_clp numeric(18,2),
  loans_clp numeric(18,2),
  advance_clp numeric(18,2),
  net_payable_clp numeric(18,2),
  fuel_liters numeric(18,3),
  source_file text not null,
  source_sheet text not null,
  source_row integer not null,
  source_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_fingerprint)
);

create table if not exists public.transport_settlement_components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  settlement_id uuid not null references public.transport_settlements(id) on delete cascade,
  component_type text not null check (component_type in ('route','fuel','casino','loan','advance','bonus','other')),
  component_key text not null,
  quantity numeric(18,3),
  unit text,
  unit_rate_clp numeric(18,4),
  amount_clp numeric(18,2),
  source_cell text,
  created_at timestamptz not null default now(),
  unique (settlement_id, component_type, component_key)
);

create index if not exists idx_mining_properties_org on public.mining_properties(organization_id);
create index if not exists idx_mining_property_royalties_org_date on public.mining_property_royalties(organization_id,event_date);
create index if not exists idx_transport_settlements_org_period on public.transport_settlements(organization_id,period_start);
create index if not exists idx_transport_settlement_components_settlement on public.transport_settlement_components(settlement_id);

alter table public.mining_properties enable row level security;
alter table public.mining_property_royalties enable row level security;
alter table public.transport_settlements enable row level security;
alter table public.transport_settlement_components enable row level security;

drop policy if exists mining_properties_org_isolation on public.mining_properties;
create policy mining_properties_org_isolation on public.mining_properties
for all using (
  organization_id in (select ur.organization_id from public.user_roles ur where ur.user_id = public.current_application_user_id())
) with check (
  organization_id in (select ur.organization_id from public.user_roles ur where ur.user_id = public.current_application_user_id())
);

drop policy if exists mining_property_royalties_org_isolation on public.mining_property_royalties;
create policy mining_property_royalties_org_isolation on public.mining_property_royalties
for all using (
  organization_id in (select ur.organization_id from public.user_roles ur where ur.user_id = public.current_application_user_id())
) with check (
  organization_id in (select ur.organization_id from public.user_roles ur where ur.user_id = public.current_application_user_id())
);

drop policy if exists transport_settlements_org_isolation on public.transport_settlements;
create policy transport_settlements_org_isolation on public.transport_settlements
for all using (
  organization_id in (select ur.organization_id from public.user_roles ur where ur.user_id = public.current_application_user_id())
) with check (
  organization_id in (select ur.organization_id from public.user_roles ur where ur.user_id = public.current_application_user_id())
);

drop policy if exists transport_settlement_components_org_isolation on public.transport_settlement_components;
create policy transport_settlement_components_org_isolation on public.transport_settlement_components
for all using (
  organization_id in (select ur.organization_id from public.user_roles ur where ur.user_id = public.current_application_user_id())
) with check (
  organization_id in (select ur.organization_id from public.user_roles ur where ur.user_id = public.current_application_user_id())
);

commit;
