-- Physical inventory verification is human evidence, NOT a stock adjustment.
-- Only explicitly assigned reviewers may confirm real quantities. Source and
-- operational balances remain immutable throughout this workflow.
create table if not exists public.bodega_stock_verifier_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  warehouse_id uuid not null references public.warehouses(id),
  profile_id uuid not null references public.profiles(id),
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  unique (organization_id, warehouse_id, profile_id)
);

create index if not exists idx_bodega_verifiers_active
  on public.bodega_stock_verifier_assignments
  (organization_id, warehouse_id, profile_id) where is_active;

-- Verified operational identity in La Patagua: Esteban Diaz, JEFE BODEGA.
-- In another environment without this exact profile/warehouse, seed nothing.
-- There is intentionally NO automatic admin/role override for verification.
insert into public.bodega_stock_verifier_assignments
  (organization_id, warehouse_id, profile_id)
select p.organization_id, w.id, p.id
from public.profiles p
join public.cargos c on c.id = p.cargo_id
join public.warehouses w on w.organization_id = p.organization_id and w.code = '002'
where p.id = 'a4616733-3bd1-45dc-8dfd-b483c22fcce1'::uuid
  and p.organization_id = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee'::uuid
  and p.status = 'active'
  and c.name = 'JEFE BODEGA'
on conflict (organization_id, warehouse_id, profile_id) do nothing;

create table if not exists public.bodega_stock_physical_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  warehouse_id uuid not null references public.warehouses(id),
  canonical_product_id uuid not null references canonical.products(id),
  product_external_id text not null,
  sku text not null,
  unit_of_measure text,
  source_quantity numeric not null,
  source_cutoff timestamptz,
  source_synced_at timestamptz,
  counted_quantity numeric(20,6) not null check (counted_quantity >= 0),
  verification_note text,
  evidence_reference text,
  verified_by uuid not null references public.profiles(id),
  verified_at timestamptz not null default now(),
  request_id uuid not null,
  unique (organization_id, request_id),
  constraint bodega_physical_difference_requires_note check (
    counted_quantity = source_quantity
    or length(btrim(coalesce(verification_note, ''))) >= 8
  ),
  constraint bodega_physical_note_length check (
    length(coalesce(verification_note, '')) <= 1000
    and length(coalesce(evidence_reference, '')) <= 500
  )
);

create index if not exists idx_bodega_physical_latest
  on public.bodega_stock_physical_verifications
  (organization_id, warehouse_id, canonical_product_id, verified_at desc, id desc);

-- Direct access is closed; only authenticated server routes using service_role
-- can read/append. No UPDATE or DELETE permission for routine workers.
alter table public.bodega_stock_verifier_assignments enable row level security;
alter table public.bodega_stock_physical_verifications enable row level security;
revoke all on public.bodega_stock_verifier_assignments from public, anon, authenticated;
revoke all on public.bodega_stock_physical_verifications from public, anon, authenticated;
revoke all on public.bodega_stock_verifier_assignments from service_role;
revoke all on public.bodega_stock_physical_verifications from service_role;
grant select on public.bodega_stock_verifier_assignments to service_role;
grant select, insert on public.bodega_stock_physical_verifications to service_role;

create or replace view public.bodega_central_stock_verification_queue_v1
with (security_invoker = true)
as
with latest as (
  select distinct on (organization_id, warehouse_id, canonical_product_id)
    id, organization_id, warehouse_id, canonical_product_id,
    counted_quantity, source_quantity, source_cutoff, source_synced_at,
    verification_note, evidence_reference, verified_by, verified_at
  from public.bodega_stock_physical_verifications
  order by organization_id, warehouse_id, canonical_product_id, verified_at desc, id desc
)
select
  p.organization_id,
  p.warehouse_id,
  p.canonical_product_id,
  p.product_external_id,
  p.sku,
  p.description,
  p.unit_of_measure,
  p.source_quantity,
  p.source_position_count,
  p.source_identity_count,
  p.has_negative_position,
  p.has_fractional_position,
  p.source_cutoff,
  p.source_synced_at,
  p.canonicalization_state,
  l.counted_quantity,
  l.source_quantity as verified_source_quantity,
  l.verified_at,
  l.verified_by,
  l.verification_note,
  l.evidence_reference,
  case
    when l.id is null then 'pending'
    when l.source_quantity is distinct from p.source_quantity then 'source_changed'
    when l.counted_quantity is distinct from p.source_quantity then 'difference'
    else 'matched'
  end as verification_state,
  case when l.id is null then null
       else l.counted_quantity - p.source_quantity end as difference_from_current_source
from public.bodega_central_stock_canonicalization_preview_v1 p
left join latest l
  on l.organization_id = p.organization_id
 and l.warehouse_id = p.warehouse_id
 and l.canonical_product_id = p.canonical_product_id;

revoke all on public.bodega_central_stock_verification_queue_v1
  from public, anon, authenticated;
grant select on public.bodega_central_stock_verification_queue_v1 to service_role;

comment on table public.bodega_stock_physical_verifications is
  'Append-only physical counts verified by an assigned warehouse head. No automatic stock change or accounting recognition.';
comment on view public.bodega_central_stock_verification_queue_v1 is
  'Esteban verification queue: latest physical count versus Laudus Central 002 cut; never a stock-mutation instruction.';
