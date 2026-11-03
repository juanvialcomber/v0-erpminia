begin;

create table if not exists public.maintenance_waste_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  work_order_id uuid not null references public.maintenance_work_orders(id) on delete restrict,
  canonical_asset_id uuid null,
  waste_code text not null,
  waste_name text not null,
  classification text not null default 'to_classify',
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  container_code text null,
  storage_location text null,
  status text not null default 'generated',
  generated_at timestamptz not null default now(),
  stored_at timestamptz null,
  removed_at timestamptz null,
  closed_at timestamptz null,
  transporter_name text null,
  transporter_identifier text null,
  destination_name text null,
  transfer_document_ref text null,
  notes text null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_waste_classification_check
    check (classification in ('hazardous','non_hazardous','to_classify')),
  constraint maintenance_waste_status_check
    check (status in ('generated','stored','removed','closed')),
  constraint maintenance_waste_unit_check
    check (unit in ('L','kg','unit'))
);

create index if not exists maintenance_waste_records_org_status_idx
  on public.maintenance_waste_records(organization_id, status, generated_at desc);

create index if not exists maintenance_waste_records_work_order_idx
  on public.maintenance_waste_records(organization_id, work_order_id, generated_at desc);

alter table public.maintenance_waste_records enable row level security;

drop policy if exists maintenance_waste_records_org_isolation on public.maintenance_waste_records;
create policy maintenance_waste_records_org_isolation
on public.maintenance_waste_records
for all
to authenticated
using (
  organization_id in (
    select ur.organization_id
    from public.user_roles ur
    where ur.user_id = (select public.current_application_user_id())
  )
  and exists (
    select 1
    from public.maintenance_work_orders wo
    where wo.id = work_order_id
      and wo.organization_id = maintenance_waste_records.organization_id
  )
)
with check (
  organization_id in (
    select ur.organization_id
    from public.user_roles ur
    where ur.user_id = (select public.current_application_user_id())
  )
  and exists (
    select 1
    from public.maintenance_work_orders wo
    where wo.id = work_order_id
      and wo.organization_id = maintenance_waste_records.organization_id
  )
);

comment on table public.maintenance_waste_records is
  'Canonical maintenance waste traceability by work order. Operational record only; does not certify regulatory compliance.';

commit;
