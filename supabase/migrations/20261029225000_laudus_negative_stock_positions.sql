-- Localized negative Laudus stock positions for Bodega review.
-- Server-only, read-only. No stock correction or reconciliation mutation.

create or replace view public.laudus_negative_stock_positions_service_v1
with (security_invoker = true)
as
with latest as (
  select distinct on (
    s.organization_id,
    s.product_external_id,
    s.warehouse_external_id,
    coalesce(s.lot, '')
  )
    s.organization_id,
    s.product_external_id,
    s.warehouse_external_id,
    s.lot,
    s.stock,
    s.source_date_to,
    s.synced_at
  from integration.laudus_product_stock s
  order by
    s.organization_id,
    s.product_external_id,
    s.warehouse_external_id,
    coalesce(s.lot, ''),
    s.source_date_to desc nulls last,
    s.synced_at desc nulls last
),
warehouse_positions as (
  select
    l.organization_id,
    l.product_external_id,
    l.warehouse_external_id,
    sum(l.stock)::numeric as warehouse_stock,
    max(l.source_date_to) as source_date_to,
    max(l.synced_at) as synced_at
  from latest l
  group by
    l.organization_id,
    l.product_external_id,
    l.warehouse_external_id
)
select
  r.organization_id,
  r.product_external_id,
  r.canonical_product_id,
  r.sku,
  r.description,
  r.unit_of_measure,
  r.laudus_stock as total_laudus_stock,
  p.warehouse_external_id,
  w.name as warehouse_name,
  p.warehouse_stock,
  p.source_date_to,
  p.synced_at
from public.laudus_inventory_reconciliation_service_v1 r
join warehouse_positions p
  on p.organization_id = r.organization_id
 and p.product_external_id = r.product_external_id
left join integration.laudus_warehouses w
  on w.organization_id = p.organization_id
 and w.external_id = p.warehouse_external_id
where r.laudus_stock < 0
  and p.warehouse_stock < 0;

revoke all on public.laudus_negative_stock_positions_service_v1 from public, anon, authenticated;
grant select on public.laudus_negative_stock_positions_service_v1 to service_role;

comment on view public.laudus_negative_stock_positions_service_v1 is
  'Server-only read projection of the specific Laudus warehouse positions causing negative total inventory. Does not correct, overwrite or infer the cause of negative stock.';
