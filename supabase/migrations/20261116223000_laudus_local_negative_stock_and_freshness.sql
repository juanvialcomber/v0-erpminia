-- Classify Laudus/MOTIL stock mismatches by evidence freshness.
-- A stale MOTIL balance is not treated as a confirmed stock conflict.

create or replace view public.laudus_inventory_freshness_summary_service_v1
with (security_invoker=true) as
select
  organization_id,
  count(*) filter (
    where reconciliation_state='quantity_mismatch'
  ) as quantity_mismatches,
  count(*) filter (
    where reconciliation_state='quantity_mismatch'
      and motil_updated_at is not null
      and laudus_synced_at is not null
      and motil_updated_at >= (laudus_synced_at at time zone 'UTC') - interval '1 day'
  ) as fresh_mismatches_1d,
  count(*) filter (
    where reconciliation_state='quantity_mismatch'
      and (
        motil_updated_at is null
        or laudus_synced_at is null
        or motil_updated_at < (laudus_synced_at at time zone 'UTC') - interval '7 days'
      )
  ) as stale_mismatches_7d,
  count(*) filter (
    where reconciliation_state='quantity_mismatch'
      and motil_updated_at is not null
      and laudus_synced_at is not null
      and motil_updated_at < (laudus_synced_at at time zone 'UTC') - interval '30 days'
  ) as stale_mismatches_30d,
  max(laudus_synced_at) as latest_laudus_stock_sync,
  max(motil_updated_at) as latest_motil_stock_update
from public.laudus_inventory_reconciliation_service_v1
group by organization_id;

revoke all on public.laudus_inventory_freshness_summary_service_v1 from public,anon,authenticated;
grant select on public.laudus_inventory_freshness_summary_service_v1 to service_role;

comment on view public.laudus_inventory_freshness_summary_service_v1
is 'Separates fresh stock conflicts from stale MOTIL comparison evidence; never mutates inventory.';

-- Warehouse-local negatives, regardless of a positive global product total.
-- Read-only and limited to physically inventoried products.
create or replace view public.laudus_negative_stock_positions_service_v1
with (security_invoker = true) as
with latest as (
  select distinct on (s.organization_id, s.product_external_id, s.warehouse_external_id, coalesce(s.lot, ''))
    s.organization_id, s.product_external_id, s.warehouse_external_id, s.lot, s.stock, s.source_date_to, s.synced_at
  from integration.laudus_product_stock s
  order by s.organization_id, s.product_external_id, s.warehouse_external_id, coalesce(s.lot, ''),
    s.source_date_to desc nulls last, s.synced_at desc nulls last
), warehouse_positions as (
  select l.organization_id, l.product_external_id, l.warehouse_external_id,
    sum(l.stock)::numeric as warehouse_stock, max(l.source_date_to) as source_date_to, max(l.synced_at) as synced_at
  from latest l group by l.organization_id, l.product_external_id, l.warehouse_external_id
)
select p.organization_id, p.product_external_id,
  coalesce(r.canonical_product_id, lp.canonical_product_id) as canonical_product_id,
  coalesce(r.sku, lp.sku) as sku,
  coalesce(r.description, lp.description) as description,
  coalesce(r.unit_of_measure, lp.unit_of_measure) as unit_of_measure,
  r.laudus_stock as total_laudus_stock,
  p.warehouse_external_id, w.name as warehouse_name,
  p.warehouse_stock, p.source_date_to, p.synced_at
from warehouse_positions p
join integration.laudus_products lp on lp.organization_id=p.organization_id and lp.external_id=p.product_external_id
left join public.laudus_inventory_reconciliation_service_v1 r on r.organization_id=p.organization_id and r.product_external_id=p.product_external_id
left join integration.laudus_warehouses w on w.organization_id=p.organization_id and w.external_id=p.warehouse_external_id
where p.warehouse_stock < 0
  and lp.inventory_eligibility = 'eligible';

revoke all on public.laudus_negative_stock_positions_service_v1 from public, anon, authenticated;
grant select on public.laudus_negative_stock_positions_service_v1 to service_role;
comment on view public.laudus_negative_stock_positions_service_v1 is
 'Read-only eligible local warehouse negatives, independent of total product balance.';
