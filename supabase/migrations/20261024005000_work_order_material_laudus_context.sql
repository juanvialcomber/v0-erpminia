create or replace function public.motil_work_order_material_laudus_context(
  p_organization_id uuid,
  p_work_order_id uuid,
  p_scope_days integer default 730
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
with req as (
  select r.id requirement_id,r.canonical_product_id,r.quantity_required,
         p.product_code,p.name product_name,p.unit,
         (lower(trim(p.product_code)) like 'otros%' or lower(trim(p.name)) like '%varios%') generic_sku
  from public.work_order_material_requirements r
  join canonical.products p on p.organization_id=r.organization_id and p.id=r.canonical_product_id
  where r.organization_id=p_organization_id
    and r.work_order_id=p_work_order_id
    and r.status<>'cancelled'
),
history as (
  select req.requirement_id,req.canonical_product_id,
         po.supplier_name,po.supplier_tax_id,po.issued_date,po.currency,
         pol.unit_price,pol.quantity,pol.line_total,
         row_number() over(
           partition by req.canonical_product_id
           order by po.issued_date desc,pol.id desc
         ) rn
  from req
  join integration.laudus_purchase_order_lines pol
    on pol.organization_id=p_organization_id
   and lower(trim(pol.sku))=lower(trim(req.product_code))
  join integration.laudus_purchase_orders po
    on po.organization_id=pol.organization_id
   and po.external_id=pol.purchase_order_external_id
  where po.issued_date >= current_date-greatest(90,least(coalesce(p_scope_days,730),1460))*interval '1 day'
    and po.issued_date <= current_date+interval '1 day'
    and not ('future_issued_date'=any(po.quality_flags))
),
stats as (
  select canonical_product_id,
         count(*)::int purchase_lines,
         count(distinct supplier_tax_id) filter(where supplier_tax_id is not null)::int supplier_count,
         max(issued_date) last_purchase_at,
         percentile_cont(0.5) within group(order by unit_price) filter(where unit_price>0)::numeric median_unit_price,
         (array_agg(unit_price order by issued_date desc) filter(where unit_price>0))[1]::numeric latest_unit_price,
         (array_agg(supplier_name order by issued_date desc) filter(where nullif(trim(supplier_name),'') is not null))[1] latest_supplier,
         count(distinct currency) filter(where nullif(trim(currency),'') is not null)::int currency_count,
         max(currency) filter(where nullif(trim(currency),'') is not null) source_currency
  from history
  group by canonical_product_id
),
rows as (
  select req.requirement_id,req.canonical_product_id,req.product_code,req.product_name,req.unit,
         req.quantity_required,req.generic_sku,
         coalesce(s.purchase_lines,0)::int purchase_lines,
         coalesce(s.supplier_count,0)::int supplier_count,
         s.last_purchase_at,s.latest_supplier,
         case when req.generic_sku then null else s.median_unit_price end median_unit_price,
         case when req.generic_sku then null else s.latest_unit_price end latest_unit_price,
         case when req.generic_sku or s.median_unit_price is null or s.median_unit_price<=0
              then null else s.latest_unit_price/nullif(s.median_unit_price,0) end price_ratio,
         case when coalesce(s.currency_count,0)=1 then s.source_currency else null end source_currency,
         case when coalesce(s.currency_count,0)=0 then 'currency_not_materialized'
              when s.currency_count=1 then 'currency_consistent'
              else 'mixed_currency' end currency_status
  from req
  left join stats s on s.canonical_product_id=req.canonical_product_id
)
select jsonb_build_object(
  'rows',coalesce((select jsonb_agg(to_jsonb(rows) order by product_code) from rows),'[]'::jsonb),
  'summary',jsonb_build_object(
    'requirement_products',(select count(*)::int from rows),
    'with_laudus_history',(select count(*) filter(where purchase_lines>0)::int from rows),
    'with_multiple_suppliers',(select count(*) filter(where supplier_count>1)::int from rows),
    'with_price_context',(select count(*) filter(where latest_unit_price is not null and median_unit_price is not null)::int from rows)
  ),
  'semantics',jsonb_build_object(
    'purchase_history','Historial de compras Laudus del mismo SKU; no prueba consumo por la OT ni por el activo.',
    'price_context','Último precio y mediana histórica del mismo SKU. Si la moneda fuente no está materializada, MOTIL no etiqueta el importe como CLP.',
    'supplier_count','Proveedores observados en órdenes de compra del mismo SKU dentro de la ventana.'
  ),
  'policy',jsonb_build_object(
    'read_only',true,
    'no_laudus_write',true,
    'no_asset_consumption_inference',true,
    'generic_sku_price_signal_disabled',true
  )
);
$$;

revoke execute on function public.motil_work_order_material_laudus_context(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.motil_work_order_material_laudus_context(uuid,uuid,integer) to service_role;
