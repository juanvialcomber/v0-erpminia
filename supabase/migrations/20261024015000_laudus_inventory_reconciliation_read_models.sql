-- Read-only Laudus inventory reconciliation surfaces for MOTIL.
-- No stock is mutated. All evidence remains source-scoped and reviewable.

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
  'autoApply', false
);
$function$;

revoke all on function public.motil_get_laudus_inventory_reconciliation_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.motil_get_laudus_inventory_reconciliation_summary(uuid)
  to service_role;

create or replace function public.motil_get_laudus_inventory_reconciliation_queue(
  p_organization_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  product_external_id text,
  sku text,
  product_name text,
  laudus_quantity numeric,
  motil_quantity numeric,
  difference numeric,
  reconciliation_state text
)
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
product_totals as (
  select s.product_external_id, sum(s.stock) as laudus_quantity
  from integration.laudus_product_stock s
  join source on source.id = s.source_id
  where s.organization_id = p_organization_id
  group by s.product_external_id
),
products as (
  select lp.external_id, lp.sku, lp.description, lp.canonical_product_id, lp.reconciliation_status
  from integration.laudus_products lp
  join source on source.id = lp.source_id
  where lp.organization_id = p_organization_id
)
select
  pt.product_external_id,
  p.sku,
  coalesce(ci.name, p.description, p.sku, pt.product_external_id) as product_name,
  pt.laudus_quantity,
  ci.quantity as motil_quantity,
  case when ci.quantity is null then null else pt.laudus_quantity - ci.quantity end as difference,
  case
    when p.canonical_product_id is null or p.reconciliation_status <> 'matched' then 'product_unresolved'
    when ci.id is null then 'missing_motil_inventory'
    when pt.laudus_quantity = ci.quantity then 'exact'
    else 'quantity_difference'
  end as reconciliation_state
from product_totals pt
left join products p on p.external_id = pt.product_external_id
left join public.canonical_inventory_current ci
  on ci.organization_id = p_organization_id
 and ci.id = p.canonical_product_id
where
  p.canonical_product_id is null
  or p.reconciliation_status <> 'matched'
  or ci.id is null
  or pt.laudus_quantity <> ci.quantity
order by
  case
    when p.canonical_product_id is null or p.reconciliation_status <> 'matched' then 1
    when ci.id is null then 2
    else 3
  end,
  abs(coalesce(pt.laudus_quantity - ci.quantity, pt.laudus_quantity)) desc,
  pt.product_external_id
limit greatest(1, least(coalesce(p_limit, 50), 200))
offset greatest(coalesce(p_offset, 0), 0);
$function$;

revoke all on function public.motil_get_laudus_inventory_reconciliation_queue(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.motil_get_laudus_inventory_reconciliation_queue(uuid, integer, integer)
  to service_role;

comment on function public.motil_get_laudus_inventory_reconciliation_summary(uuid)
  is 'Read-only summary of Laudus ERP stock evidence versus MOTIL current inventory. Never mutates stock.';
comment on function public.motil_get_laudus_inventory_reconciliation_queue(uuid, integer, integer)
  is 'Read-only queue of unresolved or differing Laudus stock positions for human review. Never mutates stock.';
