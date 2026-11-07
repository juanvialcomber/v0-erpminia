-- Route operational alerts only to the primary owner and make the action human-readable.
-- If a cargo is accidentally assigned to more than one active profile, no personal alert
-- is emitted until ownership is resolved; this avoids duplicate/ambiguous assignments.

create or replace view public.operational_task_inbox_by_user_v2 as
with active_linked_profiles as (
  select
    l.auth_user_id,
    p.id as profile_id,
    p.email,
    p.full_name,
    p.organization_id,
    p.cargo_id,
    count(*) over (partition by p.organization_id, p.cargo_id) as active_profiles_for_cargo
  from auth_profile_identity_links l
  join profiles p
    on p.id = l.profile_id
   and p.status = 'active'
   and p.cargo_id is not null
),
owner_tasks as (
  select t.*
  from operational_tasks_by_cargo_v4 t
  where t.responsibility = 'owner'
)
select
  ap.auth_user_id as user_id,
  ap.email,
  ap.full_name,
  ap.organization_id,
  ap.cargo_id,
  t.cargo_name,
  t.task_key,
  t.domain,
  t.severity,
  t.priority_score,
  t.title,
  t.evidence_summary,
  t.status as source_status,
  t.material_related,
  t.occurred_at,
  t.recommended_action,
  t.responsibility,
  case
    when split_part(t.task_key, ':', 1) = 'work_order' then
      'Abrir la OT, resolver el bloqueo indicado y registrar el resultado. La alerta se cierra cuando la OT deja de estar bloqueada.'
    when split_part(t.task_key, ':', 1) = 'work_order_material' then
      'Revisar el faltante de material de la OT y confirmar solicitud, orden de compra o recepción. La alerta se cierra cuando no quedan faltantes ni compras abiertas.'
    when split_part(t.task_key, ':', 1) = 'maintenance_review'
         and t.recommended_action = 'review_and_create_work_order' then
      'Revisar la evidencia y decidir: crear o vincular una OT si corresponde, o descartar la revisión dejando el motivo.'
    when split_part(t.task_key, ':', 1) = 'maintenance_review' then
      'Abrir la OT vinculada, revisar la evidencia y registrar la decisión de mantenimiento.'
    when split_part(t.task_key, ':', 1) = 'incident' then
      'Investigar el incidente, identificar la causa raíz y registrar acciones correctivas. Cerrar sólo con causa y evidencia registradas.'
    when split_part(t.task_key, ':', 1) = 'inspection' then
      'Ejecutar la inspección, registrar hallazgos y fecha real, y marcarla completada.'
    when split_part(t.task_key, ':', 1) = 'risk' then
      'Revisar los controles del riesgo, registrar evidencia y definir la próxima fecha de revisión.'
    when split_part(t.task_key, ':', 1) = 'shipment_review' then
      'Revisar la evidencia del despacho y validarlo sólo si los datos y documentos coinciden.'
    else
      coalesce(nullif(t.role_action, ''), 'Abrir la tarea, resolver la condición indicada y registrar el resultado.')
  end as role_action,
  coalesce(s.status, 'pending'::text) as user_state,
  s.snoozed_until,
  ap.profile_id,
  case
    when s.status = 'snoozed'::text and s.snoozed_until > now() then false
    else true
  end as visible_now,
  s.updated_at as user_state_updated_at
from active_linked_profiles ap
join owner_tasks t
  on t.organization_id = ap.organization_id
 and t.cargo_id = ap.cargo_id
left join user_action_states s
  on s.organization_id = ap.organization_id
 and s.user_id = ap.auth_user_id
 and s.source_key = t.task_key
where ap.active_profiles_for_cargo = 1;
