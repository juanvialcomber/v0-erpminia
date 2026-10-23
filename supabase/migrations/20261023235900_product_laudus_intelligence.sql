-- Product-specific, read-only Laudus intelligence for MOTIL Product 360.
-- Generic SKUs keep history/provenance but suppress price interpretation.

create or replace function public.motil_product_laudus_intelligence_preview(
  p_organization_id uuid,
  p_product_id uuid,
  p_scope_days integer default 365
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
with
params as (
  select greatest(90, least(coalesce(p_scope_days,365),730))::int as scope_days
),
product as (
  select p.id,p.organization_id,p.product_code,p.name,p.family,
         (lower(trim(p.product_code)) like 'otros%' or lower(trim(p.name)) like '%varios%') as generic_sku,
         greatest(coalesce(p.minimum_stock,0),coalesce(i.min_stock,0))::numeric minimum_required,
         coalesce(i.quantity,0)::numeric quantity_available
  from canonical.products p
  left join (
    select organization_id,sku,sum(quantity)::numeric quantity,max(min_stock)::numeric min_stock
    from public.canonical_inventory_current
    where organization_id=p_organization_id
    group by organization_id,sku
  ) i on i.organization_id=p.organization_id and lower(trim(i.sku))=lower(trim(p.product_code))
  where p.organization_id=p_organization_id and p.id=p_product_id
),
active_req as (
  select r.canonical_product_id,
         sum(r.quantity_required)::numeric required_qty,
         count(distinct r.work_order_id)::int active_work_orders,
         count(distinct r.canonical_asset_id) filter(where r.canonical_asset_id is not null)::int affected_assets,
         bool_or(lower(coalesce(w.priority,'')) in ('high','critical','alta','critica','crítica')) critical_priority
  from public.work_order_material_requirements r
  join public.maintenance_operational_work_order_flow_v1 w
    on w.organization_id=r.organization_id and w.work_order_id=r.work_order_id
  where r.organization_id=p_organization_id
    and r.canonical_product_id=p_product_id
    and lower(coalesce(w.status,'')) not in ('completed','cancelled','canceled','closed','cerrada','cerrado')
  group by r.canonical_product_id
),
lines as (
  select l.sku,po.supplier_tax_id,po.supplier_name,po.order_number,po.issued_date,
         l.unit_price,l.quantity,l.line_total
  from integration.laudus_purchase_order_lines l
  join integration.laudus_purchase_orders po
    on po.organization_id=l.organization_id
   and po.external_id=l.purchase_order_external_id
  join product p
    on lower(trim(l.sku))=lower(trim(p.product_code))
  where l.organization_id=p_organization_id
    and po.issued_date >= current_date-(select scope_days from params)*interval '1 day'
    and po.issued_date <= current_date+interval '1 day'
    and not ('future_issued_date'=any(po.quality_flags))
),
supplier_counts as (
  select nullif(trim(supplier_tax_id),'') supplier_tax_id,
         max(nullif(trim(supplier_name),'')) supplier_name,
         count(*)::int line_count,
         sum(coalesce(line_total,0))::numeric spend
  from lines
  where nullif(trim(supplier_tax_id),'') is not null
  group by nullif(trim(supplier_tax_id),'')
),
supplier_summary as (
  select count(*)::int supplier_count,
         sum(line_count)::int supplier_evidence_lines,
         case when sum(line_count)>0 then max(line_count)::numeric/sum(line_count) else null end top_supplier_share
  from supplier_counts
),
purchase_stats as (
  select count(*)::int purchase_lines,
         max(issued_date) last_purchase_at,
         sum(coalesce(quantity,0))::numeric purchased_qty,
         sum(coalesce(line_total,0))::numeric observed_spend,
         percentile_cont(0.5) within group(order by unit_price) filter(where unit_price>0)::numeric median_unit_price,
         (array_agg(unit_price order by issued_date desc) filter(where unit_price>0))[1]::numeric latest_unit_price
  from lines
),
recent_orders as (
  select order_number,supplier_tax_id,supplier_name,issued_date,unit_price,quantity,line_total
  from lines
  order by issued_date desc
  limit 8
),
top_suppliers as (
  select supplier_tax_id,supplier_name,line_count,spend,
         case when sum(line_count) over()>0 then line_count::numeric/sum(line_count) over() else null end share
  from supplier_counts
  order by line_count desc, spend desc
  limit 5
),
combined as (
  select p.*,
         coalesce(a.required_qty,0)::numeric active_required_qty,
         coalesce(a.active_work_orders,0)::int active_work_orders,
         coalesce(a.affected_assets,0)::int affected_assets,
         coalesce(a.critical_priority,false) critical_priority,
         coalesce(s.supplier_count,0)::int supplier_count,
         coalesce(s.supplier_evidence_lines,0)::int supplier_evidence_lines,
         s.top_supplier_share,
         coalesce(ps.purchase_lines,0)::int purchase_lines,
         ps.last_purchase_at,ps.purchased_qty,ps.observed_spend,
         ps.median_unit_price,ps.latest_unit_price,
         case when not p.generic_sku and ps.median_unit_price>0
              then ps.latest_unit_price/nullif(ps.median_unit_price,0)
              else null end price_ratio,
         case when coalesce(a.required_qty,0)>0
              then greatest(coalesce(a.required_qty,0)-greatest(p.quantity_available,0),0)
              else 0 end::numeric active_shortage_qty
  from product p
  left join active_req a on a.canonical_product_id=p.id
  cross join supplier_summary s
  cross join purchase_stats ps
)
select jsonb_build_object(
  'scope_days',(select scope_days from params),
  'product',jsonb_build_object(
    'product_id',c.id,
    'product_code',c.product_code,
    'name',c.name,
    'family',c.family,
    'generic_sku',c.generic_sku
  ),
  'inventory',jsonb_build_object(
    'quantity_available',c.quantity_available,
    'minimum_required',c.minimum_required
  ),
  'maintenance',jsonb_build_object(
    'active_required_qty',c.active_required_qty,
    'active_shortage_qty',c.active_shortage_qty,
    'active_work_orders',c.active_work_orders,
    'affected_assets',c.affected_assets,
    'critical_priority',c.critical_priority
  ),
  'laudus',jsonb_build_object(
    'matched',c.purchase_lines>0,
    'price_comparable',not c.generic_sku,
    'purchase_lines',c.purchase_lines,
    'last_purchase_at',c.last_purchase_at,
    'purchased_qty',c.purchased_qty,
    'observed_spend',c.observed_spend,
    'median_unit_price',case when c.generic_sku then null else c.median_unit_price end,
    'latest_unit_price',case when c.generic_sku then null else c.latest_unit_price end,
    'price_ratio',c.price_ratio,
    'supplier_count',c.supplier_count,
    'top_supplier_share',c.top_supplier_share,
    'suppliers',coalesce((select jsonb_agg(to_jsonb(t)) from top_suppliers t),'[]'::jsonb),
    'recent_orders',coalesce((select jsonb_agg(to_jsonb(r)) from recent_orders r),'[]'::jsonb)
  ),
  'interpretation',jsonb_build_object(
    'priority',
      case
        when c.active_shortage_qty>0 then 'high'
        when c.quantity_available<0 then 'high'
        when not c.generic_sku and c.price_ratio>=1.5 then 'medium'
        when not c.generic_sku and c.price_ratio>=1.2 then 'medium'
        when c.purchase_lines>=3 and c.supplier_count=1 then 'medium'
        else 'context'
      end,
    'primary_signal',
      case
        when c.active_shortage_qty>0 then 'active_maintenance_shortage'
        when c.quantity_available<0 then 'negative_stock'
        when c.generic_sku and c.purchase_lines>0 then 'generic_sku_history_only'
        when c.price_ratio>=1.5 then 'price_above_50pct'
        when c.price_ratio>=1.2 then 'price_above_20pct'
        when c.purchase_lines>=3 and c.supplier_count=1 then 'single_supplier'
        when c.purchase_lines>0 then 'purchase_history_available'
        else 'no_laudus_history'
      end
  ),
  'policy',jsonb_build_object(
    'read_only',true,
    'minimum_stock_alone_is_urgent',false,
    'purchase_history_is_consumption',false,
    'generic_sku_price_signal_disabled',true,
    'no_automatic_replenishment',true,
    'no_laudus_write',true
  )
)
from combined c;
$$;

revoke all on function public.motil_product_laudus_intelligence_preview(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.motil_product_laudus_intelligence_preview(uuid,uuid,integer) to service_role;
