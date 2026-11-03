begin;

create table if not exists public.maintenance_fluid_usage_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  work_order_id uuid not null references public.maintenance_work_orders(id) on delete restrict,
  canonical_asset_id uuid not null,
  canonical_product_id uuid null,
  stock_movement_id uuid null,
  fluid_name text not null,
  quantity_liters numeric(14,3) not null check (quantity_liters > 0),
  inventory_units_used numeric(14,3) null check (inventory_units_used is null or inventory_units_used > 0),
  inventory_unit text null,
  unit_cost_snapshot numeric(18,4) null check (unit_cost_snapshot is null or unit_cost_snapshot >= 0),
  total_cost numeric(18,2) null check (total_cost is null or total_cost >= 0),
  cost_state text not null default 'unavailable',
  source_type text not null default 'manual',
  warehouse_code text null,
  used_at timestamptz not null default now(),
  validation_status text not null default 'reported',
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_fluid_usage_cost_state_check
    check (cost_state in ('source','derived','unavailable')),
  constraint maintenance_fluid_usage_source_check
    check (source_type in ('manual','warehouse_issue','imported')),
  constraint maintenance_fluid_usage_validation_check
    check (validation_status in ('reported','verified'))
);

create index if not exists maintenance_fluid_usage_org_asset_idx
  on public.maintenance_fluid_usage_records(organization_id, canonical_asset_id, used_at desc);
create index if not exists maintenance_fluid_usage_work_order_idx
  on public.maintenance_fluid_usage_records(organization_id, work_order_id, used_at desc);

alter table public.maintenance_fluid_usage_records enable row level security;
drop policy if exists maintenance_fluid_usage_org_isolation on public.maintenance_fluid_usage_records;
create policy maintenance_fluid_usage_org_isolation
on public.maintenance_fluid_usage_records
for all
to authenticated
using (
  organization_id in (
    select ur.organization_id
    from public.user_roles ur
    where ur.user_id = (select public.current_application_user_id())
  )
  and exists (
    select 1 from public.maintenance_work_orders wo
    where wo.id = work_order_id
      and wo.organization_id = maintenance_fluid_usage_records.organization_id
  )
)
with check (
  organization_id in (
    select ur.organization_id
    from public.user_roles ur
    where ur.user_id = (select public.current_application_user_id())
  )
  and exists (
    select 1 from public.maintenance_work_orders wo
    where wo.id = work_order_id
      and wo.organization_id = maintenance_fluid_usage_records.organization_id
  )
);

create table if not exists public.maintenance_fluid_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  preventive_schedule_id uuid not null references public.preventive_maintenance_schedules(id) on delete restrict,
  canonical_asset_id uuid not null,
  canonical_product_id uuid null,
  fluid_name text not null,
  planned_input_liters numeric(14,3) not null check (planned_input_liters > 0),
  planned_waste_liters numeric(14,3) null check (planned_waste_liters is null or planned_waste_liters >= 0),
  liters_per_inventory_unit numeric(14,3) null check (liters_per_inventory_unit is null or liters_per_inventory_unit > 0),
  source_reference text null,
  active boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, preventive_schedule_id, canonical_product_id, fluid_name)
);

create index if not exists maintenance_fluid_plans_org_asset_idx
  on public.maintenance_fluid_plans(organization_id, canonical_asset_id, active);

alter table public.maintenance_fluid_plans enable row level security;
drop policy if exists maintenance_fluid_plans_org_isolation on public.maintenance_fluid_plans;
create policy maintenance_fluid_plans_org_isolation
on public.maintenance_fluid_plans
for all
to authenticated
using (
  organization_id in (
    select ur.organization_id
    from public.user_roles ur
    where ur.user_id = (select public.current_application_user_id())
  )
  and exists (
    select 1 from public.preventive_maintenance_schedules s
    where s.id = preventive_schedule_id
      and s.organization_id = maintenance_fluid_plans.organization_id
  )
)
with check (
  organization_id in (
    select ur.organization_id
    from public.user_roles ur
    where ur.user_id = (select public.current_application_user_id())
  )
  and exists (
    select 1 from public.preventive_maintenance_schedules s
    where s.id = preventive_schedule_id
      and s.organization_id = maintenance_fluid_plans.organization_id
  )
);

comment on table public.maintenance_fluid_usage_records is
  'Actual fluid usage by maintenance work order. Process evidence; inventory remains canonical in Bodega.';
comment on table public.maintenance_fluid_plans is
  'Planner-approved fluid quantities per preventive maintenance schedule for deterministic projection.';

commit;
