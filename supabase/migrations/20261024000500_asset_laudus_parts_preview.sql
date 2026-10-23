-- Asset 360 bridge: traced parts -> canonical product -> Laudus history.
create or replace function public.motil_asset_laudus_parts_preview(
  p_organization_id uuid,
  p_asset_id uuid,
  p_scope_days integer default 365
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
with params as (
  select greatest(90, least(coalesce(p_scope_days,365),730))::int scope_days
),
parts as (
  select wp.canonical_product_id,
         count(*)::int part_rows,
         sum(coalesce(wp.quantity_installed,0))::numeric installed_qty,
         sum(coalesce(wp.total_cost,0))::numeric traced_parts_cost,
         count(distinct wp.work_order_id)::int work_orders
  from public.work_order_parts wp
  where wp.organization_id=p_organization_id
    and wp.canonical_asset_id=p_asset_id
    and wp.canonical_product_id is not null
  group by wp.canonical_product_id
),
products as (
  select p.id,p.product_code,p.name,p.family,
         (lower(trim(p.product_code)) like 'otros%' or lower(trim(p.name)) like '%varios%') generic_sku,
         pt.part_rows,pt.installed_qty,pt.traced_parts_cost,pt.work_orders
  from parts pt
  join canonical.products p on p.organization_id=p_organization_id and p.id=pt.canonical_product_id
),
laudus_lines as (
  select pr.id product_id,nullif(trim(po.supplier_tax_id),'') supplier_tax_id,po.issued_date,l.unit_price
  from products pr
  join integration.laudus_purchase_order_lines l
    on l.organization_id=p_organization_id and lower(trim(l.sku))=lower(trim(pr.product_code))
  join integration.laudus_purchase_orders po
    on po.organization_id=l.organization_id and po.external_id=l.purchase_order_external_id
  where po.issued_date >= current_date-(select scope_days from params)*interval '1 day'
    and po.issued_date <= current_date+interval '1 day'
    and not ('future_issued_date'=any(po.quality_flags))
),
stats as (
  select product_id,count(*)::int purchase_lines,
         count(distinct supplier_tax_id) filter(where supplier_tax_id is not null)::int supplier_count,
         max(issued_date) last_purchase_at,
         percentile_cont(0.5) within group(order by unit_price) filter(where unit_price>0)::numeric median_unit_price,
         (array_agg(unit_price order by issued_date desc) filter(where unit_price>0))[1]::numeric latest_unit_price
  from laudus_lines
  group by product_id
),
detail as (
  select pr.*,coalesce(s.purchase_lines,0)::int purchase_lines,coalesce(s.supplier_count,0)::int supplier_count,
         s.last_purchase_at,
         case when pr.generic_sku then null else s.median_unit_price end median_unit_price,
         case when pr.generic_sku then null else s.latest_unit_price end latest_unit_price,
         case when not pr.generic_sku and s.median_unit_price>0 then s.latest_unit_price/nullif(s.median_unit_price,0) else null end price_ratio,
         (coalesce(s.purchase_lines,0)>0) laudus_matched
  from products pr left join stats s on s.product_id=pr.id
),
summary as (
  select count(*)::int linked_products,
         count(*) filter(where installed_qty>0)::int installed_products,
         count(*) filter(where laudus_matched)::int laudus_matched_products,
         coalesce(sum(installed_qty),0)::numeric installed_qty,
         coalesce(sum(traced_parts_cost),0)::numeric traced_parts_cost,
         coalesce(sum(work_orders),0)::int work_order_links
  from detail
),
prioritized as (
  select id product_id,product_code,name,family,generic_sku,installed_qty,traced_parts_cost,work_orders,
         laudus_matched,purchase_lines,supplier_count,last_purchase_at,median_unit_price,latest_unit_price,price_ratio
  from detail
  order by case when installed_qty>0 then 0 else 1 end,traced_parts_cost desc,work_orders desc,purchase_lines desc,product_code
  limit 12
)
select jsonb_build_object(
  'scope_days',(select scope_days from params),
  'summary',to_jsonb(summary),
  'products',coalesce((select jsonb_agg(to_jsonb(prioritized)) from prioritized),'[]'::jsonb),
  'readiness',case
    when summary.linked_products=0 then 'material_traceability_required'
    when summary.installed_products=0 then 'installation_evidence_required'
    when summary.laudus_matched_products=0 then 'laudus_product_match_required'
    else 'economic_context_available' end,
  'semantics',jsonb_build_object(
    'traced_parts_cost','Costo registrado en work_order_parts para este activo.',
    'laudus_history','Historial de compra del SKU; no demuestra que esa compra haya sido hecha para este activo.',
    'asset_tco','No se calcula TCO mientras adquisición, consumo, servicios externos y costo de detención no tengan cobertura suficiente.'
  ),
  'policy',jsonb_build_object(
    'read_only',true,
    'laudus_purchase_is_asset_consumption',false,
    'no_repair_replace_recommendation_without_evidence',true,
    'generic_sku_price_signal_disabled',true,
    'no_laudus_write',true
  )
) from summary;
$$;
revoke all on function public.motil_asset_laudus_parts_preview(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.motil_asset_laudus_parts_preview(uuid,uuid,integer) to service_role;
