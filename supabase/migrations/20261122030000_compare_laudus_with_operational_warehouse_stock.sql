-- Compare Laudus stock against the operational MOTIL stock table.
-- The prior view used public.bodega_inventory, a legacy import table which is
-- not read by maintenance issue/return operations. This version compares totals
-- by canonical product ID against public.warehouse_stock, the table used by those
-- operations. It remains read-only and does not promote or overwrite any balance.
--
-- Warehouse-level cutover remains a separate readiness requirement: current
-- warehouse_stock rows are not assigned to a warehouse/bin, so this view compares
-- product totals only and must not be used to claim location-level parity.

create or replace view public.laudus_inventory_reconciliation_service_v1
with (security_invoker = true)
as
with laudus as (
  select
    p.organization_id,
    min(p.external_id) as product_external_id,
    p.canonical_product_id,
    upper(trim(min(p.sku))) as sku,
    min(p.description) as description,
    min(p.unit_of_measure) as unit_of_measure,
    min(p.operational_category) as operational_category,
    min(p.inventory_eligibility) as inventory_eligibility,
    case when count(distinct p.external_id) > 1 then 'identity_conflict' else min(p.reconciliation_status) end as product_reconciliation_status,
    coalesce(sum(s.stock), 0)::numeric as laudus_stock,
    count(s.id)::bigint as stock_position_count,
    count(*) filter (where s.stock <> 0)::bigint as nonzero_stock_position_count,
    max(s.source_date_to) as source_date_to,
    max(s.synced_at) as laudus_synced_at
  from integration.laudus_products p
  left join integration.laudus_product_stock s
    on s.organization_id = p.organization_id
   and s.product_external_id = p.external_id
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

comment on view public.laudus_inventory_reconciliation_service_v1 is
  'Server-only comparison of resolved eligible Laudus product totals with operational MOTIL warehouse_stock totals by canonical product ID. Read-only; no automatic promotion, overwrite, or warehouse-level parity claim.';
