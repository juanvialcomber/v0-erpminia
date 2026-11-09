-- Preventive/inspection work orders must not fabricate a root cause.
-- Root cause remains mandatory for corrective work only.
-- Preventive actions remain mandatory for all non-general technical work.

do $view$
declare
  v_def text;
begin
  select pg_get_viewdef('public.work_order_close_readiness_v2'::regclass, true)
    into v_def;

  v_def := replace(
    v_def,
    'lower(COALESCE(wo.work_type, ''''::text)) <> ''general''::text AND COALESCE(TRIM(BOTH FROM wo.root_cause), ''''::text) = ''''::text',
    'lower(COALESCE(wo.work_type, ''''::text)) = ANY (ARRAY[''correctivo''::text, ''corrective''::text]) AND COALESCE(TRIM(BOTH FROM wo.root_cause), ''''::text) = ''''::text'
  );

  v_def := replace(
    v_def,
    'lower(COALESCE(wo.work_type, ''''::text)) = ''general''::text OR COALESCE(TRIM(BOTH FROM wo.root_cause), ''''::text) <> ''''::text',
    'NOT (lower(COALESCE(wo.work_type, ''''::text)) = ANY (ARRAY[''correctivo''::text, ''corrective''::text])) OR COALESCE(TRIM(BOTH FROM wo.root_cause), ''''::text) <> ''''::text'
  );

  execute 'create or replace view public.work_order_close_readiness_v2 as ' || v_def;
end
$view$;

create or replace function public.close_work_order_safely(p_work_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_wo public.maintenance_work_orders%rowtype;
  v_cost record;
  v_sequence integer;
  v_actor uuid;
  v_runtime_evidence_status text := null;
  v_runtime_reading_id uuid := null;
  v_has_runtime_evidence boolean := false;
  v_pending_plan_steps integer;
  v_authorized boolean := false;
  v_photo_count integer := 0;
  v_fluid_declaration record;
  v_current_fluid_usage_count integer := 0;
  v_declared_fluid_usage_count integer := 0;
begin
  select * into v_wo
  from public.maintenance_work_orders
  where id = p_work_order_id
  for update;

  if not found then
    raise exception 'Orden no encontrada';
  end if;

  v_actor := public.current_application_user_id();
  if v_actor is null then
    raise exception 'Sin permisos';
  end if;

  select (
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = v_actor
        and ur.organization_id = v_wo.organization_id
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = v_actor
        and p.organization_id = v_wo.organization_id
        and lower(coalesce(p.status, 'active')) = 'active'
        and (
          lower(coalesce(p.role, '')) in ('superadmin','admin','manager','operaciones-supervisor','jefe_mantencion')
          or exists (
            select 1
            from public.role_matrix rm
            where rm.cargo_id = p.cargo_id
              and rm.module_key = 'mant_operaciones'
              and rm.access_level = 'ED'
          )
        )
    )
    or exists (
      select 1
      from public.people pe
      where pe.organization_id = v_wo.organization_id
        and pe.profile_id = v_actor
        and pe.employment_status = 'active'
        and pe.id = v_wo.assigned_person_id
    )
  ) into v_authorized;

  if not coalesce(v_authorized, false) then
    raise exception 'Sin permisos';
  end if;

  if v_wo.status = 'completed' then
    raise exception 'La orden ya está cerrada';
  end if;
  if lower(coalesce(v_wo.status, '')) <> 'in_progress' then
    raise exception 'La orden debe estar en ejecución antes de cerrar';
  end if;
  if v_wo.canonical_asset_id is null and lower(coalesce(v_wo.work_type, '')) <> 'general' then
    raise exception 'La orden no puede cerrarse sin equipo asociado';
  end if;
  if lower(coalesce(v_wo.work_type, '')) in ('correctivo','corrective')
     and coalesce(trim(v_wo.root_cause), '') = '' then
    raise exception 'Registra la causa principal antes de cerrar';
  end if;
  if lower(coalesce(v_wo.work_type, '')) <> 'general'
     and coalesce(trim(v_wo.preventive_actions), '') = '' then
    raise exception 'Registra la acción preventiva antes de cerrar';
  end if;
  if coalesce(v_wo.actual_duration_hours, 0) <= 0 then
    raise exception 'Registra las horas reales antes de cerrar';
  end if;
  if lower(coalesce(v_wo.timer_status, 'idle')) in ('running','paused') then
    raise exception 'Detén el cronómetro antes de cerrar la OT';
  end if;

  select count(*) into v_photo_count
  from public.work_order_evidence_files
  where organization_id = v_wo.organization_id
    and work_order_id = p_work_order_id
    and evidence_type = 'photo';

  if v_photo_count < 1 then
    raise exception 'Agrega al menos una foto como evidencia antes de cerrar la OT';
  end if;

  select e.actor_id, e.payload, e.event_at
  into v_fluid_declaration
  from public.work_order_events e
  where e.organization_id = v_wo.organization_id
    and e.work_order_id = p_work_order_id
    and e.event_type = 'fluid_closure_declared'
  order by e.event_at desc
  limit 1;

  if not found then
    raise exception 'Antes de cerrar, el mecánico asignado debe confirmar los aceites/fluidos utilizados y el estado del residuo';
  end if;

  if v_fluid_declaration.actor_id is distinct from v_actor then
    raise exception 'La declaración de aceites/fluidos debe ser realizada por el mecánico asignado que está cerrando la OT';
  end if;

  if coalesce((v_fluid_declaration.payload ->> 'declared_by_assigned_executor')::boolean, false) is not true
     or jsonb_typeof(v_fluid_declaration.payload -> 'fluids_used') <> 'boolean' then
    raise exception 'La declaración de aceites/fluidos no es válida para cierre';
  end if;

  select count(*) into v_current_fluid_usage_count
  from public.maintenance_fluid_usage_records
  where organization_id = v_wo.organization_id
    and work_order_id = p_work_order_id;

  v_declared_fluid_usage_count := coalesce((v_fluid_declaration.payload ->> 'fluid_usage_count')::integer, 0);

  if v_current_fluid_usage_count <> v_declared_fluid_usage_count then
    raise exception 'Los datos de aceites/fluidos cambiaron después de la confirmación';
  end if;

  if coalesce((v_fluid_declaration.payload ->> 'fluids_used')::boolean, false)
     and v_current_fluid_usage_count < 1 then
    raise exception 'La declaración indica uso de fluidos, pero no hay fluidos registrados';
  end if;

  if not coalesce((v_fluid_declaration.payload ->> 'fluids_used')::boolean, false)
     and v_current_fluid_usage_count > 0 then
    raise exception 'La declaración indica que no hubo fluidos, pero existen registros de uso';
  end if;

  select count(*) into v_pending_plan_steps
  from public.work_order_standard_plan_execution_v1
  where organization_id = v_wo.organization_id
    and work_order_id = p_work_order_id
    and execution_status = 'pending';

  if v_pending_plan_steps > 0 then
    raise exception 'Completa todos los pasos del plan estándar antes de cerrar la OT';
  end if;

  select re.evidence_status, re.runtime_reading_id
  into v_runtime_evidence_status, v_runtime_reading_id
  from public.work_order_runtime_evidence re
  where re.organization_id = v_wo.organization_id
    and re.work_order_id = p_work_order_id;

  v_has_runtime_evidence := found;

  if lower(coalesce(v_wo.work_type, '')) in ('correctivo','corrective') and not v_has_runtime_evidence then
    raise exception 'Registra el horómetro o documenta por qué no está disponible antes de cerrar';
  end if;

  select * into v_cost
  from public.work_order_final_cost_v1
  where organization_id = v_wo.organization_id
    and work_order_id = p_work_order_id;

  if coalesce(v_cost.pending_external_services, 0) > 0 then
    raise exception 'Hay servicios externos pendientes de aprobación';
  end if;
  if coalesce(v_cost.open_labor_entries, 0) > 0 then
    raise exception 'Hay registros de trabajo aún abiertos';
  end if;
  if coalesce(v_cost.external_cost_conflict, false) then
    raise exception 'El costo externo está duplicado entre el campo legado y servicios externos; reconcilie antes de cerrar';
  end if;

  select coalesce(max(closure_sequence), 0) + 1 into v_sequence
  from public.work_order_closure_cost_snapshots
  where work_order_id = p_work_order_id;

  insert into public.work_order_closure_cost_snapshots(
    organization_id, work_order_id, closure_sequence, canonical_asset_id, cost_center_id,
    parts_cost, labor_cost, external_services_cost, legacy_external_cost, effective_external_cost,
    procurement_received_cost, procurement_currency, procurement_currency_count, total_cost,
    external_cost_basis, closed_by, closed_at
  ) values (
    v_wo.organization_id, p_work_order_id, v_sequence, v_wo.canonical_asset_id, v_wo.cost_center_id,
    coalesce(v_cost.parts_cost, 0), coalesce(v_cost.labor_cost, 0), coalesce(v_cost.external_services_cost, 0),
    coalesce(v_cost.legacy_external_cost, 0), coalesce(v_cost.effective_external_cost, 0), v_cost.procurement_received_cost,
    v_cost.procurement_currency, coalesce(v_cost.procurement_currency_count, 0), coalesce(v_cost.total_cost, 0),
    v_cost.external_cost_basis, v_actor, now()
  );

  update public.maintenance_work_orders
  set status = 'completed',
      completion_date = now(),
      closed_at = now(),
      closed_by = v_actor,
      updated_at = now()
  where id = p_work_order_id;

  insert into public.work_order_events(
    organization_id, work_order_id, canonical_asset_id, event_type, actor_id,
    source_table, source_record_id, summary, payload
  ) values (
    v_wo.organization_id, p_work_order_id, v_wo.canonical_asset_id, 'work_order_closed', v_actor,
    'maintenance_work_orders', p_work_order_id::text, 'Orden cerrada con costo final trazable',
    jsonb_build_object(
      'closed_at', now(),
      'closure_sequence', v_sequence,
      'cost_center_id', v_wo.cost_center_id,
      'parts_cost', coalesce(v_cost.parts_cost, 0),
      'labor_cost', coalesce(v_cost.labor_cost, 0),
      'external_cost', coalesce(v_cost.effective_external_cost, 0),
      'total_cost', coalesce(v_cost.total_cost, 0),
      'procurement_received_cost', v_cost.procurement_received_cost,
      'procurement_currency', v_cost.procurement_currency,
      'procurement_currency_count', coalesce(v_cost.procurement_currency_count, 0),
      'procurement_received_cost_is_evidence_only', true,
      'external_cost_basis', v_cost.external_cost_basis,
      'runtime_evidence_status', v_runtime_evidence_status,
      'runtime_reading_id', v_runtime_reading_id,
      'standard_plan_pending_steps', v_pending_plan_steps,
      'material_reconciliation_deferred', true,
      'unmet_material_requirements', coalesce(v_cost.unmet_material_requirements, 0),
      'pending_parts', coalesce(v_cost.pending_parts, 0),
      'open_procurement_orders', coalesce(v_cost.open_procurement_orders, 0)
    )
  );

  return p_work_order_id;
end;
$function$;

revoke all on function public.close_work_order_safely(uuid) from public, anon, authenticated;
grant execute on function public.close_work_order_safely(uuid) to postgres, service_role;
