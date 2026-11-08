-- Aggregate the remaining physical asset identity backlog into one bounded Bodega campaign.
-- This adds task routing only. It does not create assets, modify stock, or write Laudus.

create or replace view public.operational_tasks_by_cargo_v10
with (security_invoker = true)
as
select *
from public.operational_tasks_by_cargo_v9

union all

select
  d.organization_id,
  c.id as cargo_id,
  c.name as cargo_name,
  'asset-identification-campaign:bodega'::text as task_key,
  'inventory'::text as domain,
  'warning'::text as severity,
  68 as priority_score,
  'Identificar activos físicos en Bodega'::text as title,
  concat_ws(
    ' · ',
    count(*) filter (where d.issue_type='asset_candidate_missing_unit_identifier')::text || ' unidad(es) sin identificador',
    count(*) filter (where d.issue_type='asset_family_requires_unit_disaggregation')::text || ' familia(s) múltiples por desagregar',
    'capturar serie/placa/etiqueta y ubicación exacta'
  ) as evidence_summary,
  'pending'::text as status,
  false as material_related,
  max(coalesce(d.updated_at,d.created_at)) as occurred_at,
  'capture_asset_identity_in_bodega'::text as recommended_action,
  'owner'::text as responsibility,
  'Durante inventario físico, identificar cada unidad con serie/placa/etiqueta y ubicación exacta. No modificar stock ni crear Fichas 360 automáticamente.'::text as role_action
from public.data_reconciliation_reviews d
join public.cargos c on upper(c.name)='JEFE BODEGA'
where d.status='open'
  and d.entity_type='asset'
  and d.issue_type in ('asset_candidate_missing_unit_identifier','asset_family_requires_unit_disaggregation')
group by d.organization_id,c.id,c.name

union all

select
  d.organization_id,
  c.id as cargo_id,
  c.name as cargo_name,
  'asset-identification-campaign:maintenance-support'::text as task_key,
  'maintenance'::text as domain,
  'info'::text as severity,
  50 as priority_score,
  'Apoyar identificación física de activos'::text as title,
  concat_ws(' · ',
    count(*) filter (where d.issue_type='asset_candidate_missing_unit_identifier')::text || ' unidad(es) sin identificador',
    count(*) filter (where d.issue_type='asset_family_requires_unit_disaggregation')::text || ' familia(s) múltiples'
  ) as evidence_summary,
  'pending'::text as status,
  false as material_related,
  max(coalesce(d.updated_at,d.created_at)) as occurred_at,
  'support_asset_identity_capture'::text as recommended_action,
  'support'::text as responsibility,
  'Apoyar a Bodega sólo cuando la placa o serie no sea suficiente para reconocer el equipo. Mantenimiento conserva autoridad sobre identidad operacional.'::text as role_action
from public.data_reconciliation_reviews d
join public.cargos c on upper(c.name)='JEFE DEPARTAMENTO DE MANTENIMIENTO'
where d.status='open'
  and d.entity_type='asset'
  and d.issue_type in ('asset_candidate_missing_unit_identifier','asset_family_requires_unit_disaggregation')
group by d.organization_id,c.id,c.name;

revoke all on public.operational_tasks_by_cargo_v10 from public, anon;
grant select on public.operational_tasks_by_cargo_v10 to authenticated, service_role;

do $$
declare
  v_def text;
begin
  select pg_get_viewdef('public.role_tasks_by_cargo_v1'::regclass,true)
  into v_def;

  if position('operational_tasks_by_cargo_v9' in v_def)=0 then
    raise exception 'role_tasks_by_cargo_v1 no longer references operational_tasks_by_cargo_v9';
  end if;

  execute
    'create or replace view public.role_tasks_by_cargo_v1 with (security_invoker = true) as ' ||
    replace(v_def,'operational_tasks_by_cargo_v9','operational_tasks_by_cargo_v10');
end $$;
