-- Richer read-only Laudus reconciliation queue.
-- Keeps units and review reasons explicit; never mutates inventory.

create or replace function public.motil_get_laudus_inventory_reconciliation_queue_v2(
  p_organization_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  product_external_id text,
  sku text,
  product_name text,
  category text,
  unit_of_measure text,
  laudus_quantity numeric,
  motil_quantity numeric,
  difference numeric,
  relative_difference_pct numeric,
  reconciliation_state text,
  review_reason text
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
  select
    lp.external_id,
    lp.sku,
    lp.description,
    lp.canonical_product_id,
    lp.reconciliation_status,
    nullif(lp.source_payload->>'unitOfMeasure','') as unit_of_measure
  from integration.laudus_products lp
  join source on source.id = lp.source_id
  where lp.organization_id = p_organization_id
)
select
  pt.product_external_id,
  p.sku,
  coalesce(ci.name, p.description, p.sku, pt.product_external_id) as product_name,
  ci.category,
  p.unit_of_measure,
  pt.laudus_quantity,
  ci.quantity as motil_quantity,
  case when ci.quantity is null then null else pt.laudus_quantity - ci.quantity end as difference,
  case
    when ci.quantity is null or ci.quantity = 0 then null
    else round(100.0 * (pt.laudus_quantity - ci.quantity) / abs(ci.quantity), 2)
  end as relative_difference_pct,
  case
    when p.canonical_product_id is null or p.reconciliation_status <> 'matched' then 'product_unresolved'
    when ci.id is null then 'missing_motil_inventory'
    when pt.laudus_quantity = ci.quantity then 'exact'
    when ci.quantity = 0 and pt.laudus_quantity <> 0 then 'motil_zero_baseline'
    else 'quantity_difference'
  end as reconciliation_state,
  case
    when p.canonical_product_id is null or p.reconciliation_status <> 'matched'
      then 'Resolver identidad de producto antes de comparar stock.'
    when ci.id is null
      then 'Producto Laudus identificado, pero sin posición vigente en inventario MOTIL.'
    when ci.quantity = 0 and pt.laudus_quantity <> 0
      then 'MOTIL tiene baseline cero; revisar frescura y procedencia antes de interpretar la diferencia.'
    when pt.laudus_quantity <> ci.quantity
      then 'Diferencia cuantitativa entre fuentes; revisar fecha, unidad y bodega antes de ajustar.'
    else 'Sin diferencia.'
  end as review_reason
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
    when ci.quantity = 0 and pt.laudus_quantity <> 0 then 3
    else 4
  end,
  case
    when ci.quantity is null or ci.quantity = 0 then abs(pt.laudus_quantity)
    else abs((pt.laudus_quantity - ci.quantity) / nullif(ci.quantity,0))
  end desc nulls last,
  pt.product_external_id
limit greatest(1, least(coalesce(p_limit, 50), 200))
offset greatest(coalesce(p_offset, 0), 0);
$function$;

revoke all on function public.motil_get_laudus_inventory_reconciliation_queue_v2(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.motil_get_laudus_inventory_reconciliation_queue_v2(uuid, integer, integer)
  to service_role;

comment on function public.motil_get_laudus_inventory_reconciliation_queue_v2(uuid, integer, integer)
  is 'Read-only Laudus inventory review queue with units, relative variance and explicit review reason.';
