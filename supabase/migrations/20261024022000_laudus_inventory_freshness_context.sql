-- Add source freshness context to Laudus inventory reconciliation summary.
-- Read-only; no inventory mutation.

create or replace function public.motil_get_laudus_inventory_reconciliation_summary(
  p_organization_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, integration, pg_temp
as $function$
with source as (
  select id
  from integration.external_sources
  where organization_id = p_organization_id
    and source_key = 'laudus'
    and enabled
  limit 1
),
stock as (
  select s.*
  from integration.laudus_product_stock s
  join source on source.id = s.source_id
  where s.organization_id = p_organization_id
),
product_totals as (
  select product_external_id, sum(stock) as laudus_quantity
  from stock
  group by product_external_id
),
mapped as (
  select lp.external_id, lp.canonical_product_id
  from integration.laudus_products lp
  join source on source.id = lp.source_id
  where lp.organization_id = p_organization_id
    and lp.reconciliation_status = 'matched'
    and lp.canonical_product_id is not null
),
comparison as (
  select
    pt.product_external_id,
    pt.laudus_quantity,
    m.canonical_product_id,
    ci.quantity as motil_quantity
  from product_totals pt
  left join mapped m on m.external_id = pt.product_external_id
  left join public.canonical_inventory_current ci
    on ci.organization_id = p_organization_id
   and ci.id = m.canonical_product_id
),
warehouses as (
  select lw.*
  from integration.laudus_warehouses lw
  join source on source.id = lw.source_id
  where lw.organization_id = p_organization_id
),
latest_run as (
  select sr.status, sr.finished_at, sr.counters
  from integration.sync_runs sr
  join source on source.id = sr.source_id
  where sr.organization_id = p_organization_id
    and sr.checkpoint->>'entity_type' = 'stock'
  order by sr.created_at desc
  limit 1
),
motil_snapshot as (
  select max(snapshot_date) as snapshot_date
  from public.canonical_inventory_current
  where organization_id = p_organization_id
)
select jsonb_build_object(
  'stockRows', (select count(*) from stock),
  'sourceWarehouses', (select count(*) from warehouses),
  'mappedWarehouses', (select count(*) from warehouses where motil_warehouse_id is not null and reconciliation_status = 'matched'),
  'unresolvedWarehouseMappings', (select count(*) from warehouses where motil_warehouse_id is null or reconciliation_status <> 'matched'),
  'productsWithStock', (select count(*) from product_totals),
  'matchedProductsWithStock', (select count(*) from comparison where canonical_product_id is not null),
  'unresolvedProductsWithStock', (select count(*) from comparison where canonical_product_id is null),
  'comparedProducts', (select count(*) from comparison where motil_quantity is not null),
  'exactQuantityMatches', (select count(*) from comparison where motil_quantity is not null and laudus_quantity = motil_quantity),
  'quantityDifferences', (select count(*) from comparison where motil_quantity is not null and laudus_quantity <> motil_quantity),
  'missingMotilInventoryRows', (select count(*) from comparison where canonical_product_id is not null and motil_quantity is null),
  'latestSyncStatus', (select status from latest_run),
  'latestSyncAt', (select finished_at from latest_run),
  'latestSyncCounters', coalesce((select counters from latest_run), '{}'::jsonb),
  'motilSnapshotDate', (select snapshot_date from motil_snapshot),
  'freshnessComparable', (
    select case
      when snapshot_date is null or (select finished_at from latest_run) is null then false
      else snapshot_date >= ((select finished_at from latest_run)::date - 1)
    end
    from motil_snapshot
  ),
  'autoApply', false
);
$function$;

revoke all on function public.motil_get_laudus_inventory_reconciliation_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.motil_get_laudus_inventory_reconciliation_summary(uuid)
  to service_role;
