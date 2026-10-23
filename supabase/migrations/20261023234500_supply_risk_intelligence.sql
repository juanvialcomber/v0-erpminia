-- Explainable read-only supply-risk engine.
-- Uses current stock, active maintenance requirements and Laudus purchase evidence.

CREATE OR REPLACE FUNCTION public.motil_supply_risk_preview(p_organization_id uuid, p_scope_days integer DEFAULT 365)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'canonical', 'integration', 'pg_temp'
AS $function$
with
params as (
  select greatest(90, least(coalesce(p_scope_days,365),730))::int scope_days
),
products as (
  select p.organization_id,p.id product_id,p.product_code,p.name,p.family,
         greatest(coalesce(p.minimum_stock,0),coalesce(i.min_stock,0))::numeric minimum_required,
         coalesce(i.quantity,0)::numeric quantity_on_hand,
         coalesce(i.quantity,0)::numeric quantity_available
  from canonical.products p
  left join (
    select organization_id,sku,sum(quantity)::numeric quantity,max(min_stock)::numeric min_stock
    from public.canonical_inventory_current
    where organization_id=p_organization_id
    group by organization_id,sku
  ) i on i.organization_id=p.organization_id and lower(trim(i.sku))=lower(trim(p.product_code))
  where p.organization_id=p_organization_id and p.is_active=true and p.is_purchasable=true
),
active_req as (
  select r.organization_id,r.canonical_product_id,
         sum(r.quantity_required)::numeric required_qty,
         count(distinct r.work_order_id)::int active_work_orders,
         count(distinct r.canonical_asset_id) filter(where r.canonical_asset_id is not null)::int affected_assets,
         bool_or(lower(coalesce(w.priority,'')) in ('high','critical','alta','critica','crítica')) critical_priority
  from public.work_order_material_requirements r
  join public.maintenance_operational_work_order_flow_v1 w
    on w.organization_id=r.organization_id and w.work_order_id=r.work_order_id
  where r.organization_id=p_organization_id
    and lower(coalesce(w.status,'')) not in ('completed','cancelled','canceled','closed','cerrada','cerrado')
  group by r.organization_id,r.canonical_product_id
),
laudus_lines as (
  select l.organization_id,lower(trim(l.sku)) sku_key,
         nullif(trim(po.supplier_tax_id),'') supplier_tax_id,
         po.issued_date,l.unit_price,l.quantity
  from integration.laudus_purchase_order_lines l
  join integration.laudus_purchase_orders po
    on po.organization_id=l.organization_id and po.external_id=l.purchase_order_external_id
  where l.organization_id=p_organization_id
    and nullif(trim(l.sku),'') is not null
    and po.issued_date >= current_date-(select scope_days from params)*interval '1 day'
    and po.issued_date <= current_date+interval '1 day'
    and not ('future_issued_date'=any(po.quality_flags))
),
supplier_counts as (
  select organization_id,sku_key,supplier_tax_id,count(*)::int line_count
  from laudus_lines
  where supplier_tax_id is not null
  group by organization_id,sku_key,supplier_tax_id
),
supplier_stats as (
  select organization_id,sku_key,
         count(distinct supplier_tax_id)::int supplier_count,
         sum(line_count)::int supplier_evidence_lines,
         case when sum(line_count)>0 then max(line_count)::numeric/sum(line_count) else null end top_supplier_share
  from supplier_counts
  group by organization_id,sku_key
),
purchase_stats as (
  select organization_id,sku_key,
         count(*)::int purchase_lines,
         max(issued_date) last_purchase_at,
         sum(coalesce(quantity,0))::numeric purchased_qty,
         percentile_cont(0.5) within group(order by unit_price) filter(where unit_price>0)::numeric median_unit_price,
         (array_agg(unit_price order by issued_date desc) filter(where unit_price>0))[1]::numeric latest_unit_price
  from laudus_lines
  group by organization_id,sku_key
),
benchmark as (
  select organization_id,canonical_product_id,benchmark_unit_cost,latest_observed_unit_cost
  from public.canonical_product_price_benchmarks_v1
  where organization_id=p_organization_id
),
base as (
  select p.*,
         coalesce(r.required_qty,0)::numeric active_required_qty,
         coalesce(r.active_work_orders,0)::int active_work_orders,
         coalesce(r.affected_assets,0)::int affected_assets,
         coalesce(r.critical_priority,false) critical_priority,
         coalesce(s.supplier_count,0)::int supplier_count,
         coalesce(s.supplier_evidence_lines,0)::int supplier_evidence_lines,
         s.top_supplier_share,
         coalesce(ps.purchase_lines,0)::int purchase_lines,
         ps.last_purchase_at,ps.purchased_qty,
         coalesce(ps.median_unit_price,b.benchmark_unit_cost) median_unit_price,
         coalesce(ps.latest_unit_price,b.latest_observed_unit_cost) latest_unit_price,
         case when coalesce(ps.median_unit_price,b.benchmark_unit_cost)>0
              then coalesce(ps.latest_unit_price,b.latest_observed_unit_cost)
                   / nullif(coalesce(ps.median_unit_price,b.benchmark_unit_cost),0)
              else null end price_ratio,
         (ps.sku_key is not null) laudus_matched
  from products p
  left join active_req r on r.organization_id=p.organization_id and r.canonical_product_id=p.product_id
  left join purchase_stats ps on ps.organization_id=p.organization_id and ps.sku_key=lower(trim(p.product_code))
  left join supplier_stats s on s.organization_id=p.organization_id and s.sku_key=lower(trim(p.product_code))
  left join benchmark b on b.organization_id=p.organization_id and b.canonical_product_id=p.product_id
),
scored as (
  select b.*,
         case when b.active_required_qty>0 then greatest(b.active_required_qty-greatest(b.quantity_available,0),0) else 0 end::numeric active_shortage_qty,
         (
           case when b.active_required_qty>0 and b.active_required_qty>greatest(b.quantity_available,0) then 45 else 0 end
           + case when b.critical_priority and b.active_required_qty>0 and b.active_required_qty>greatest(b.quantity_available,0) then 15 else 0 end
           + case when b.minimum_required>0 and b.quantity_available<=0 then 30
                  when b.minimum_required>0 and b.quantity_available<b.minimum_required then 20 else 0 end
           + case when b.purchase_lines>=2 and b.supplier_count=1 then 15
                  when b.purchase_lines>=2 and coalesce(b.top_supplier_share,0)>=0.8 then 10 else 0 end
           + case when b.price_ratio>=1.5 then 20
                  when b.price_ratio>=1.2 then 10 else 0 end
         )::int risk_score,
         array_remove(array[
           case when b.active_required_qty>0 and b.active_required_qty>greatest(b.quantity_available,0) then 'active_maintenance_shortage' end,
           case when b.critical_priority and b.active_required_qty>0 and b.active_required_qty>greatest(b.quantity_available,0) then 'critical_work_order' end,
           case when b.minimum_required>0 and b.quantity_available<=0 then 'zero_stock'
                when b.minimum_required>0 and b.quantity_available<b.minimum_required then 'below_minimum' end,
           case when b.purchase_lines>=2 and b.supplier_count=1 then 'single_supplier'
                when b.purchase_lines>=2 and coalesce(b.top_supplier_share,0)>=0.8 then 'supplier_concentration' end,
           case when b.price_ratio>=1.5 then 'price_above_50pct'
                when b.price_ratio>=1.2 then 'price_above_20pct' end
         ],null) risk_reasons
  from base b
),
summary as (
  select
    count(*)::int total_products,
    count(*) filter(where laudus_matched)::int laudus_matched_products,
    count(*) filter(where minimum_required>0 and quantity_available<minimum_required)::int below_minimum,
    count(*) filter(where minimum_required>0 and quantity_available<=0)::int zero_stock_below_minimum,
    count(*) filter(where active_required_qty>0 and active_required_qty>greatest(quantity_available,0))::int active_maintenance_shortages,
    count(*) filter(where purchase_lines>=2 and supplier_count=1)::int single_supplier_products,
    count(*) filter(where price_ratio>=1.2)::int price_outliers_20pct,
    count(*) filter(where risk_score>=50)::int high_risk,
    count(*) filter(where risk_score between 30 and 49)::int medium_risk
  from scored
),
top_actions as (
  select product_id,product_code,name,family,risk_score,risk_reasons,
         quantity_available,minimum_required,active_required_qty,active_shortage_qty,
         active_work_orders,affected_assets,critical_priority,
         supplier_count,top_supplier_share,purchase_lines,last_purchase_at,
         median_unit_price,latest_unit_price,price_ratio,laudus_matched
  from scored
  where risk_score>=20
  order by risk_score desc,active_work_orders desc,active_shortage_qty desc,purchase_lines desc,product_code
  limit 20
)
select jsonb_build_object(
  'scope_days',(select scope_days from params),
  'summary',to_jsonb(summary),
  'coverage',jsonb_build_object(
    'laudus_sku_match_rate',case when summary.total_products>0
      then summary.laudus_matched_products::numeric/summary.total_products else 0 end
  ),
  'top_actions',coalesce((select jsonb_agg(to_jsonb(top_actions)) from top_actions),'[]'::jsonb),
  'policy','read_only_explainable',
  'score_model','active OT shortage + current stock vs minimum + supplier concentration + price deviation'
)
from summary;
$function$


revoke all on function public.motil_supply_risk_preview(uuid,integer) from public,anon,authenticated;
grant execute on function public.motil_supply_risk_preview(uuid,integer) to service_role;

comment on function public.motil_supply_risk_preview(uuid,integer) is
  'Read-only explainable supply-risk preview. Separates current stock risk, active maintenance demand, supplier concentration and price deviation. Never mutates inventory, purchase orders or Laudus.';
