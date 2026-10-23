-- Supplier 360 economic-operational snapshot from real Laudus purchase lines.
-- Read-only. Header totals are not trusted because current source coverage contains zero totals.

CREATE OR REPLACE FUNCTION public.motil_supplier_economic_snapshot(p_organization_id uuid, p_supplier_tax_id text, p_scope_days integer DEFAULT 365)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'canonical', 'integration', 'pg_temp'
AS $function$
with
params as (
  select greatest(90,least(coalesce(p_scope_days,365),730))::int scope_days,
         regexp_replace(coalesce(p_supplier_tax_id,''),'[^0-9kK]','','g') supplier_key
),
orders as (
  select po.external_id,po.issued_date,po.supplier_name,po.supplier_tax_id
  from integration.laudus_purchase_orders po, params
  where po.organization_id=p_organization_id
    and regexp_replace(coalesce(po.supplier_tax_id,''),'[^0-9kK]','','g')=params.supplier_key
    and po.issued_date between current_date-params.scope_days*interval '1 day' and current_date+interval '1 day'
    and not ('future_issued_date'=any(po.quality_flags))
),
lines as (
  select l.purchase_order_external_id,l.sku,l.description,l.quantity,l.unit_price,l.line_total,o.issued_date
  from integration.laudus_purchase_order_lines l
  join orders o on o.external_id=l.purchase_order_external_id
  where l.organization_id=p_organization_id
),
product_stats as (
  select lower(trim(sku)) sku_key,sku,max(description) description,
         count(*)::int purchase_lines,
         sum(coalesce(quantity,0))::numeric purchased_qty,
         sum(coalesce(line_total,coalesce(quantity,0)*coalesce(unit_price,0),0))::numeric spend,
         min(unit_price) filter(where unit_price>0)::numeric min_unit_price,
         max(unit_price) filter(where unit_price>0)::numeric max_unit_price,
         percentile_cont(0.5) within group(order by unit_price) filter(where unit_price>0)::numeric median_unit_price,
         (array_agg(unit_price order by issued_date desc) filter(where unit_price>0))[1]::numeric latest_unit_price,
         max(issued_date) last_purchase_at
  from lines
  where nullif(trim(sku),'') is not null
  group by lower(trim(sku)),sku
),
all_supplier_counts as (
  select lower(trim(l.sku)) sku_key,
         count(distinct regexp_replace(coalesce(po.supplier_tax_id,''),'[^0-9kK]','','g'))::int supplier_count
  from integration.laudus_purchase_order_lines l
  join integration.laudus_purchase_orders po
    on po.organization_id=l.organization_id and po.external_id=l.purchase_order_external_id,
       params
  where l.organization_id=p_organization_id
    and nullif(trim(l.sku),'') is not null
    and nullif(trim(po.supplier_tax_id),'') is not null
    and po.issued_date between current_date-params.scope_days*interval '1 day' and current_date+interval '1 day'
    and not ('future_issued_date'=any(po.quality_flags))
  group by lower(trim(l.sku))
),
canonical_map as (
  select p.id product_id,lower(trim(p.product_code)) sku_key,p.product_code,p.name,p.family
  from canonical.products p
  where p.organization_id=p_organization_id
),
maint_hist as (
  select r.canonical_product_id,
         count(distinct r.work_order_id)::int historical_work_orders,
         count(distinct r.canonical_asset_id) filter(where r.canonical_asset_id is not null)::int historical_assets,
         count(distinct r.work_order_id) filter(
           where lower(coalesce(w.status,'')) not in ('completed','cancelled','canceled','closed','cerrada','cerrado')
         )::int active_work_orders
  from public.work_order_material_requirements r
  left join public.maintenance_operational_work_order_flow_v1 w
    on w.organization_id=r.organization_id and w.work_order_id=r.work_order_id
  where r.organization_id=p_organization_id
  group by r.canonical_product_id
),
enriched as (
  select ps.*,cm.product_id,cm.product_code,cm.name canonical_name,cm.family,
         coalesce(ascs.supplier_count,0)::int supplier_count,
         coalesce(mh.historical_work_orders,0)::int historical_work_orders,
         coalesce(mh.historical_assets,0)::int historical_assets,
         coalesce(mh.active_work_orders,0)::int active_work_orders,
         case when ps.median_unit_price>0 then ps.latest_unit_price/ps.median_unit_price else null end price_ratio
  from product_stats ps
  left join all_supplier_counts ascs on ascs.sku_key=ps.sku_key
  left join canonical_map cm on cm.sku_key=ps.sku_key
  left join maint_hist mh on mh.canonical_product_id=cm.product_id
),
summary as (
  select
    (select count(*) from orders)::int order_count,
    count(*)::int distinct_products,
    sum(spend)::numeric line_spend,
    sum(purchased_qty)::numeric purchased_quantity,
    count(*) filter(where supplier_count=1)::int sole_source_products,
    count(*) filter(where supplier_count>=2)::int multi_source_products,
    count(*) filter(where price_ratio>=1.2)::int price_outliers_20pct,
    count(*) filter(where historical_work_orders>0)::int maintenance_linked_products,
    count(*) filter(where active_work_orders>0)::int active_maintenance_products,
    sum(historical_work_orders)::int historical_work_orders,
    sum(historical_assets)::int historical_asset_links,
    max(last_purchase_at) last_purchase_at
  from enriched
),
top_products as (
  select product_id,coalesce(product_code,sku) product_code,
         coalesce(canonical_name,description,sku) name,family,
         purchase_lines,purchased_qty,spend,supplier_count,
         historical_work_orders,historical_assets,active_work_orders,
         latest_unit_price,median_unit_price,price_ratio,last_purchase_at,
         case when supplier_count=1 then 'sole_source'
              when supplier_count>=2 then 'multi_source'
              else 'supplier_coverage_unknown' end sourcing_state
  from enriched
  order by spend desc,purchase_lines desc,last_purchase_at desc
  limit 20
),
price_review as (
  select product_id,coalesce(product_code,sku) product_code,
         coalesce(canonical_name,description,sku) name,
         latest_unit_price,median_unit_price,price_ratio,purchase_lines,last_purchase_at
  from enriched
  where price_ratio>=1.2 and purchase_lines>=2
  order by price_ratio desc,purchase_lines desc
  limit 12
)
select jsonb_build_object(
  'scope_days',(select scope_days from params),
  'summary',to_jsonb(summary),
  'top_products',coalesce((select jsonb_agg(to_jsonb(top_products)) from top_products),'[]'::jsonb),
  'price_review',coalesce((select jsonb_agg(to_jsonb(price_review)) from price_review),'[]'::jsonb),
  'spend_basis','sum of Laudus purchase-order line totals; header totals are not trusted for this metric',
  'policy','read_only_explainable'
)
from summary;
$function$
;

revoke all on function public.motil_supplier_economic_snapshot(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.motil_supplier_economic_snapshot(uuid,text,integer) to service_role;

comment on function public.motil_supplier_economic_snapshot(uuid,text,integer) is
  'Read-only supplier economic snapshot from Laudus purchase-order lines, sourcing concentration, price history and maintenance linkage.';
