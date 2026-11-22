-- Establish an explicit MOTIL warehouse assignment on operational stock.
-- Existing rows stay unassigned; no location is inferred from old data.
alter table public.warehouse_stock
  add column if not exists warehouse_id uuid references public.warehouses(id);

create index if not exists idx_warehouse_stock_org_warehouse_product
  on public.warehouse_stock (organization_id, warehouse_id, canonical_product_id);

create unique index if not exists warehouse_stock_org_warehouse_part_batch_key
  on public.warehouse_stock (organization_id, warehouse_id, part_code, coalesce(batch_number, ''))
  where warehouse_id is not null;

comment on column public.warehouse_stock.warehouse_id is
  'MOTIL warehouse for this operational stock position. Null means location has not been reconciled.';

-- Esteban identified Laudus Bodega Central (external warehouse 002) as the
-- reliable opening-stock baseline. Compare that source alone; do not add stock
-- across Santiago, Peumo, Don Jaime, Services, or pickup locations.
--
-- This view is intentionally ADDITIVE and must not redefine the existing
-- laudus_inventory_reconciliation_service_v1 shared by Bodega reporting,
-- negative-stock alerts and other operational views. Its historical
-- organization-wide/legacy-stock semantics are preserved.
-- Compare Central only against warehouse_stock rows explicitly assigned to
-- Central; never infer a location for existing unassigned MOTIL rows.
-- they are never silently treated as Central.
--
-- No balance is promoted or overwritten by this migration.

create or replace view public.laudus_central_warehouse_stock_reconciliation_v1
with (security_invoker = true)
as
with central_warehouse as (
  select
    organization_id,
    external_id,
    motil_warehouse_id
  from integration.laudus_warehouses
  where external_id = '002'
    and reconciliation_status = 'matched'
    and motil_warehouse_id is not null
),
laudus as (
  select
    p.organization_id,
    min(p.external_id) as product_external_id,
    p.canonical_product_id,
    upper(trim(min(p.sku))) as sku,
    min(p.description) as description,
    min(p.unit_of_measure) as unit_of_measure,
    min(p.operational_category) as operational_category,
    min(p.inventory_eligibility) as inventory_eligibility,
    case
      when count(distinct p.external_id) > 1 then 'identity_conflict'
      else min(p.reconciliation_status)
    end as product_reconciliation_status,
    coalesce(sum(s.stock), 0)::numeric as laudus_stock,
    count(s.id)::bigint as stock_position_count,
    count(*) filter (where s.stock <> 0)::bigint as nonzero_stock_position_count,
    max(s.source_date_to) as source_date_to,
    max(s.synced_at) as laudus_synced_at
  from integration.laudus_products p
  join central_warehouse w
    on w.organization_id = p.organization_id
  left join integration.laudus_product_stock s
    on s.organization_id = p.organization_id
   and s.product_external_id = p.external_id
   and s.warehouse_external_id = w.external_id
  where nullif(trim(p.sku), '') is not null
    and p.inventory_eligibility = 'eligible'
    and p.reconciliation_status = 'matched'
    and p.canonical_product_id is not null
  group by p.organization_id, p.canonical_product_id
),
motil as (
  select
    b.organization_id,
    b.canonical_product_id,
    sum(coalesce(b.quantity_on_hand, 0))::numeric as motil_stock,
    case
      when sum(coalesce(b.quantity_on_hand, 0)) <> 0
        then sum(coalesce(b.quantity_on_hand, 0) * coalesce(b.unit_cost, 0))
             / sum(coalesce(b.quantity_on_hand, 0))
      else max(b.unit_cost)
    end as motil_unit_cost,
    max(b.updated_at) as motil_updated_at
  from public.warehouse_stock b
  join central_warehouse w
    on w.organization_id = b.organization_id
   and w.motil_warehouse_id = b.warehouse_id
  where b.canonical_product_id is not null
  group by b.organization_id, b.canonical_product_id
)
select
  l.organization_id,
  l.product_external_id,
  l.canonical_product_id,
  l.sku,
  l.description,
  l.unit_of_measure,
  l.operational_category,
  l.inventory_eligibility,
  l.product_reconciliation_status,
  l.laudus_stock,
  l.stock_position_count,
  l.nonzero_stock_position_count,
  l.source_date_to,
  l.laudus_synced_at,
  m.motil_stock,
  m.motil_unit_cost,
  m.motil_updated_at,
  case
    when m.canonical_product_id is null then null::numeric
    else m.motil_stock - l.laudus_stock
  end as quantity_delta,
  case
    when m.canonical_product_id is null and l.laudus_stock = 0 then 'laudus_only_zero'
    when m.canonical_product_id is null then 'missing_in_motil'
    when abs(coalesce(m.motil_stock, 0) - coalesce(l.laudus_stock, 0)) <= 0.005 then 'aligned'
    else 'quantity_mismatch'
  end as reconciliation_state
from laudus l
left join motil m
  on m.organization_id = l.organization_id
 and m.canonical_product_id = l.canonical_product_id;

revoke all on public.laudus_central_warehouse_stock_reconciliation_v1 from public, anon, authenticated;
grant select on public.laudus_central_warehouse_stock_reconciliation_v1 to service_role;

comment on view public.laudus_central_warehouse_stock_reconciliation_v1 is
  'Server-only comparison of eligible Laudus Bodega Central (002) stock with MOTIL warehouse_stock assigned to the mapped Central warehouse. Read-only; no automatic promotion or overwrite.';
