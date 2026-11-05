begin;

create or replace function public.lock_work_order_close_evidence_mutation_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_work_order_id uuid;
  v_event_type text;
begin
  if tg_op = 'DELETE' then
    v_work_order_id := old.work_order_id;
    if tg_table_name = 'work_order_events' then
      v_event_type := old.event_type;
    end if;
  else
    v_work_order_id := new.work_order_id;
    if tg_table_name = 'work_order_events' then
      v_event_type := new.event_type;
    end if;
  end if;

  if v_work_order_id is not null
     and (
       tg_table_name in ('maintenance_fluid_usage_records', 'work_order_evidence_files')
       or (tg_table_name = 'work_order_events' and v_event_type in ('fluid_closure_declared', 'waste_generated'))
     ) then
    perform pg_advisory_xact_lock(hashtextextended(v_work_order_id::text, 9137));
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists maintenance_fluid_usage_close_guard_lock on public.maintenance_fluid_usage_records;
create trigger maintenance_fluid_usage_close_guard_lock
before insert or update or delete on public.maintenance_fluid_usage_records
for each row execute function public.lock_work_order_close_evidence_mutation_v1();

drop trigger if exists work_order_evidence_close_guard_lock on public.work_order_evidence_files;
create trigger work_order_evidence_close_guard_lock
before insert or update or delete on public.work_order_evidence_files
for each row execute function public.lock_work_order_close_evidence_mutation_v1();

drop trigger if exists work_order_events_close_guard_lock on public.work_order_events;
create trigger work_order_events_close_guard_lock
before insert or update or delete on public.work_order_events
for each row execute function public.lock_work_order_close_evidence_mutation_v1();

create or replace function public.close_work_order_with_timer_v3(
  p_organization_id uuid,
  p_work_order_id uuid,
  p_actor_id uuid default null,
  p_actor_name text default null,
  p_actual_duration_hours numeric default null,
  p_root_cause text default null,
  p_preventive_actions text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_declaration public.work_order_events%rowtype;
  v_payload jsonb;
  v_usage_count integer := 0;
  v_photo_count integer := 0;
  v_linked_waste_count integer := 0;
  v_declared_usage_count integer := -1;
  v_fluids_used text;
  v_waste_status text;
begin
  -- Serialize all closure-sensitive evidence mutations for this OT.
  perform pg_advisory_xact_lock(hashtextextended(p_work_order_id::text, 9137));

  perform 1
  from public.maintenance_work_orders
  where id = p_work_order_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Orden no encontrada' using errcode = 'P0002';
  end if;

  select *
    into v_declaration
  from public.work_order_events
  where organization_id = p_organization_id
    and work_order_id = p_work_order_id
    and event_type = 'fluid_closure_declared'
  order by event_at desc, created_at desc
  limit 1;

  if not found then
    raise exception 'El mecánico asignado debe confirmar los aceites/fluidos antes de cerrar la OT' using errcode = '55000';
  end if;

  v_payload := coalesce(v_declaration.payload, '{}'::jsonb);
  v_fluids_used := v_payload->>'fluids_used';
  v_waste_status := v_payload->>'waste_status';

  if v_declaration.actor_id is distinct from p_actor_id
     or coalesce(v_payload->>'declared_by_assigned_executor', 'false') <> 'true' then
    raise exception 'La declaración de aceites/fluidos debe corresponder al ejecutor asignado que cierra la OT' using errcode = '55000';
  end if;

  if v_fluids_used not in ('true', 'false') then
    raise exception 'La declaración de aceites/fluidos no es válida para cierre' using errcode = '55000';
  end if;

  if coalesce(v_payload->>'fluid_usage_count', '') ~ '^[0-9]+$' then
    v_declared_usage_count := (v_payload->>'fluid_usage_count')::integer;
  end if;

  select count(*) into v_usage_count
  from public.maintenance_fluid_usage_records
  where organization_id = p_organization_id
    and work_order_id = p_work_order_id;

  if v_declared_usage_count <> v_usage_count then
    raise exception 'Los datos de aceites/fluidos cambiaron después de la confirmación; confirma nuevamente antes de cerrar' using errcode = '55000';
  end if;

  if v_fluids_used = 'true' and v_usage_count < 1 then
    raise exception 'La OT declara uso de fluidos pero no tiene usos registrados' using errcode = '55000';
  end if;

  if v_fluids_used = 'false' and v_usage_count > 0 then
    raise exception 'La OT tiene fluidos registrados y no puede declararse sin uso de fluidos' using errcode = '55000';
  end if;

  if v_fluids_used = 'false' and v_waste_status <> 'not_applicable' then
    raise exception 'Sin uso de fluidos, el estado de residuo debe ser No aplica' using errcode = '55000';
  end if;

  if v_fluids_used = 'true' and v_waste_status not in ('linked', 'none_recovered') then
    raise exception 'Con uso de fluidos, confirma el estado del residuo antes de cerrar' using errcode = '55000';
  end if;

  if v_waste_status = 'linked' then
    select count(*) into v_linked_waste_count
    from public.work_order_events
    where organization_id = p_organization_id
      and work_order_id = p_work_order_id
      and event_type = 'waste_generated'
      and coalesce(payload->>'source_fluid_usage_id', '') <> '';

    if v_linked_waste_count < 1 then
      raise exception 'La OT declara residuo recuperado pero no existe evidencia vinculada' using errcode = '55000';
    end if;
  end if;

  select count(*) into v_photo_count
  from public.work_order_evidence_files
  where organization_id = p_organization_id
    and work_order_id = p_work_order_id
    and evidence_type = 'photo';

  if v_photo_count < 1 then
    raise exception 'Agrega al menos una foto como evidencia antes de cerrar la OT' using errcode = '55000';
  end if;

  perform public.close_work_order_with_timer_v2(
    p_organization_id,
    p_work_order_id,
    p_actor_id,
    p_actor_name,
    p_actual_duration_hours,
    p_root_cause,
    p_preventive_actions
  );

  return p_work_order_id;
end;
$function$;

revoke all on function public.close_work_order_with_timer_v3(uuid, uuid, uuid, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.close_work_order_with_timer_v3(uuid, uuid, uuid, text, numeric, text, text) to service_role;

comment on function public.close_work_order_with_timer_v3(uuid, uuid, uuid, text, numeric, text, text) is
'Final atomic OT close gate: serializes fluid/evidence mutations, revalidates assigned-executor fluid declaration and photo evidence, then delegates timer-aware transactional close.';

commit;
