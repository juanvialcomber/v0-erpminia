create or replace function public.motil_material_traceability_readiness(
  p_organization_id uuid,
  p_limit integer default 25
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
with modern as (
  select wo.id,wo.organization_id,wo.work_order_number,wo.title,wo.status,wo.priority,
         wo.canonical_asset_id,wo.materials_required,wo.materials_reviewed_at,
         a.asset_code,a.name asset_name
  from public.maintenance_work_orders wo
  left join canonical.assets a
    on a.organization_id=wo.organization_id and a.id=wo.canonical_asset_id
  where wo.organization_id=p_organization_id
    and wo.created_by is not null
),
requirements as (
  select r.organization_id,r.work_order_id,
         count(*) filter(where r.status<>'cancelled')::int requirement_lines,
         count(distinct r.canonical_product_id) filter(where r.status<>'cancelled')::int requirement_products
  from public.work_order_material_requirements r
  where r.organization_id=p_organization_id
  group by r.organization_id,r.work_order_id
),
parts as (
  select wp.organization_id,wp.work_order_id,
         count(*) filter(where wp.status<>'cancelled')::int part_lines,
         count(distinct wp.canonical_product_id) filter(where wp.status<>'cancelled')::int part_products,
         coalesce(sum(wp.quantity_reserved) filter(where wp.status<>'cancelled'),0)::numeric reserved_qty,
         coalesce(sum(wp.quantity_issued) filter(where wp.status<>'cancelled'),0)::numeric issued_qty,
         coalesce(sum(wp.quantity_installed) filter(where wp.status<>'cancelled'),0)::numeric installed_qty,
         coalesce(sum(wp.quantity_returned) filter(where wp.status<>'cancelled'),0)::numeric returned_qty,
         coalesce(sum(wp.total_cost) filter(where wp.status<>'cancelled'),0)::numeric traced_parts_cost
  from public.work_order_parts wp
  where wp.organization_id=p_organization_id
  group by wp.organization_id,wp.work_order_id
),
req_products as (
  select distinct r.organization_id,r.work_order_id,r.canonical_product_id,lower(trim(p.product_code)) sku
  from public.work_order_material_requirements r
  join canonical.products p on p.organization_id=r.organization_id and p.id=r.canonical_product_id
  where r.organization_id=p_organization_id and r.status<>'cancelled'
),
laudus_skus as (
  select distinct l.organization_id,lower(trim(l.sku)) sku
  from integration.laudus_purchase_order_lines l
  where l.organization_id=p_organization_id and nullif(trim(l.sku),'') is not null
),
laudus as (
  select rp.organization_id,rp.work_order_id,
         count(*)::int requirement_products,
         count(*) filter(where ls.sku is not null)::int laudus_matched_products
  from req_products rp
  left join laudus_skus ls on ls.organization_id=rp.organization_id and ls.sku=rp.sku
  group by rp.organization_id,rp.work_order_id
),
scored as (
  select m.*,
         coalesce(r.requirement_lines,0)::int requirement_lines,
         coalesce(r.requirement_products,0)::int requirement_products,
         coalesce(p.part_lines,0)::int part_lines,
         coalesce(p.part_products,0)::int part_products,
         coalesce(p.reserved_qty,0)::numeric reserved_qty,
         coalesce(p.issued_qty,0)::numeric issued_qty,
         coalesce(p.installed_qty,0)::numeric installed_qty,
         coalesce(p.returned_qty,0)::numeric returned_qty,
         coalesce(p.traced_parts_cost,0)::numeric traced_parts_cost,
         coalesce(l.laudus_matched_products,0)::int laudus_matched_products,
         case
           when m.materials_required is null then 'material_intent_missing'
           when m.materials_required=false and coalesce(r.requirement_lines,0)=0 then 'declared_no_materials'
           when m.materials_required=false and coalesce(r.requirement_lines,0)>0 then 'inconsistent_no_materials'
           when m.materials_required=true and coalesce(r.requirement_lines,0)=0 then 'materials_not_defined'
           when coalesce(p.part_lines,0)=0 then 'requirements_without_part_trace'
           when coalesce(p.issued_qty,0)=0 then 'reserved_not_issued'
           when coalesce(p.installed_qty,0)=0 then 'issued_not_installed'
           when coalesce(l.laudus_matched_products,0)<coalesce(r.requirement_products,0) then 'installed_without_full_laudus_context'
           else 'economic_trace_ready'
         end readiness,
         case
           when m.materials_required is null then 0
           when m.materials_required=false and coalesce(r.requirement_lines,0)=0 then 100
           when m.materials_required=false and coalesce(r.requirement_lines,0)>0 then 5
           when m.materials_required=true and coalesce(r.requirement_lines,0)=0 then 20
           when coalesce(p.part_lines,0)=0 then 40
           when coalesce(p.issued_qty,0)=0 then 55
           when coalesce(p.installed_qty,0)=0 then 70
           when coalesce(l.laudus_matched_products,0)<coalesce(r.requirement_products,0) then 85
           else 100
         end traceability_score
  from modern m
  left join requirements r on r.organization_id=m.organization_id and r.work_order_id=m.id
  left join parts p on p.organization_id=m.organization_id and p.work_order_id=m.id
  left join laudus l on l.organization_id=m.organization_id and l.work_order_id=m.id
),
summary as (
  select
    count(*)::int modern_work_orders,
    count(*) filter(where materials_required is null)::int material_intent_missing,
    count(*) filter(where materials_required=false and requirement_lines=0)::int declared_no_materials,
    count(*) filter(where materials_required=true)::int declared_uses_materials,
    count(*) filter(where requirement_lines>0)::int with_requirements,
    count(*) filter(where part_lines>0)::int with_part_trace,
    count(*) filter(where issued_qty>0)::int with_issued_materials,
    count(*) filter(where installed_qty>0)::int with_installed_materials,
    count(*) filter(where readiness='economic_trace_ready')::int economic_trace_ready,
    count(*) filter(where requirement_products>0 and laudus_matched_products=requirement_products)::int requirements_with_full_laudus_history,
    count(*) filter(where status='completed' and readiness not in ('declared_no_materials','economic_trace_ready'))::int completed_with_trace_gap,
    round(avg(traceability_score)::numeric,1) overall_traceability_score
  from scored
),
prioritized as (
  select id work_order_id,work_order_number,title,status,priority,canonical_asset_id,asset_code,asset_name,
         materials_required,materials_reviewed_at,requirement_lines,requirement_products,part_lines,part_products,
         reserved_qty,issued_qty,installed_qty,returned_qty,traced_parts_cost,
         laudus_matched_products,readiness,traceability_score
  from scored
  where readiness not in ('declared_no_materials','economic_trace_ready')
  order by
    case when status='completed' then 0 else 1 end,
    traceability_score asc,
    case priority when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
    work_order_number
  limit greatest(1,least(coalesce(p_limit,25),100))
)
select jsonb_build_object(
  'summary',to_jsonb(summary),
  'queue',coalesce((select jsonb_agg(to_jsonb(prioritized)) from prioritized),'[]'::jsonb),
  'semantics',jsonb_build_object(
    'score','Secuencia de cobertura del proceso; no mide calidad del mantenimiento ni ROI.',
    'economic_trace_ready','OT con intención explícita, requerimientos, trazabilidad de repuestos instalada y contexto Laudus completo para los productos requeridos.',
    'declared_no_materials','Cierre válido de la rama de materiales: la OT declaró explícitamente que no usa materiales.',
    'laudus_history','Historial de compra del SKU; no demuestra por sí solo consumo por el activo.'
  ),
  'policy',jsonb_build_object(
    'missing_is_not_zero',true,
    'no_auto_asset_consumption_from_laudus',true,
    'human_material_intent_required',true,
    'service_role_only',true
  )
) from summary;
$$;

revoke execute on function public.motil_material_traceability_readiness(uuid,integer) from public,anon,authenticated;
grant execute on function public.motil_material_traceability_readiness(uuid,integer) to service_role;
