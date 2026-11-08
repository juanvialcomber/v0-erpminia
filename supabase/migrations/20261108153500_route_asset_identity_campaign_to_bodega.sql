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
    count(*) filter (where d.issue_type='existing_asset_family_requires_unit_disambiguation')::text || ' familia(s) canónicas ambiguas',
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
  and d.issue_type in ('asset_candidate_missing_unit_identifier','asset_family_requires_unit_disaggregation','existing_asset_family_requires_unit_disambiguation')
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
    count(*) filter (where d.issue_type='asset_family_requires_unit_disaggregation')::text || ' familia(s) múltiples',
    count(*) filter (where d.issue_type='existing_asset_family_requires_unit_disambiguation')::text || ' familia(s) ambiguas'
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
  and d.issue_type in ('asset_candidate_missing_unit_identifier','asset_family_requires_unit_disaggregation','existing_asset_family_requires_unit_disambiguation')
group by d.organization_id,c.id,c.name

union all

select
  d.organization_id,
  c.id as cargo_id,
  c.name as cargo_name,
  'facility-identity:javito'::text as task_key,
  'operations'::text as domain,
  'info'::text as severity,
  55 as priority_score,
  'Confirmar identidad operacional de Tranque Relave Javito'::text as title,
  d.evidence_reference as evidence_summary,
  'pending'::text as status,
  false as material_related,
  coalesce(d.updated_at,d.created_at) as occurred_at,
  'confirm_javito_operational_identity'::text as recommended_action,
  'owner'::text as responsibility,
  'Confirmar que Javito será la única entidad operacional para el tranque, definir límites/responsable y luego autorizar alta canónica. No crear ni fusionar automáticamente.'::text as role_action
from public.data_reconciliation_reviews d
join public.cargos c on upper(c.name)='GERENTE DE OPERACIONES'
where d.status='open'
  and d.issue_key='finance_facility_candidate:javito'

union all

select
  d.organization_id,
  c.id as cargo_id,
  c.name as cargo_name,
  'asset-canonical-approval:60332526'::text as task_key,
  'maintenance'::text as domain,
  'warning'::text as severity,
  78 as priority_score,
  'Aprobar alta canónica de Motor Cummins 60332526'::text as title,
  d.evidence_reference as evidence_summary,
  'pending'::text as status,
  false as material_related,
  coalesce(d.updated_at,d.created_at) as occurred_at,
  'approve_canonical_asset_candidate'::text as recommended_action,
  'owner'::text as responsibility,
  'Validar físicamente la serie 60332526 y aprobar o rechazar el alta. La evidencia incluye Depreciación y 14 líneas de OC con la serie exacta; no crear automáticamente.'::text as role_action
from public.data_reconciliation_reviews d
join public.cargos c on upper(c.name)='JEFE DEPARTAMENTO DE MANTENIMIENTO'
where d.status='open'
  and d.issue_key='depreciation_asset_candidate:serial:60332526';

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
