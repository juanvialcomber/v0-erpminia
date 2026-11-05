begin;

-- An overnight timer with no confirmed pause must not silently become worked time.
-- Preserve already confirmed seconds and ask the assigned mechanic to report
-- the unverified session separately before the technical closure.
create or replace function public.pause_overlong_work_order_timer_for_review(
  p_organization_id uuid,
  p_work_order_id uuid,
  p_actor_id uuid default null,
  p_actor_name text default null,
  p_notes text default null
) returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_wo public.maintenance_work_orders%rowtype;
  v_now timestamptz := now();
  v_elapsed integer;
  v_credited integer;
begin
  if nullif(trim(coalesce(p_notes, '')), '') is null then
    raise exception 'Debes indicar el motivo de la pausa' using errcode = '22023';
  end if;

  select * into v_wo
  from public.maintenance_work_orders
  where id = p_work_order_id and organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Orden no encontrada' using errcode = 'P0002';
  end if;
  if v_wo.timer_status <> 'running' or v_wo.timer_start_time is null then
    raise exception 'El cronómetro ya no está en ejecución' using errcode = '55000';
  end if;

  v_elapsed := greatest(0, floor(extract(epoch from (v_now - v_wo.timer_start_time)))::integer);
  if v_elapsed < 16 * 3600 then
    raise exception 'Solo se permite esta pausa supervisada para sesiones prolongadas' using errcode = '55000';
  end if;

  v_credited := greatest(coalesce(v_wo.total_timer_seconds, 0), coalesce(v_wo.total_timer_minutes, 0) * 60);
  update public.maintenance_work_orders
  set timer_status = 'paused',
      timer_start_time = null,
      total_timer_seconds = v_credited,
      total_timer_minutes = floor(v_credited::numeric / 60)::integer,
      actual_duration_hours = v_credited::numeric / 3600,
      updated_at = v_now
  where id = p_work_order_id and organization_id = p_organization_id;

  insert into public.work_order_events(
    organization_id,work_order_id,canonical_asset_id,event_type,event_at,
    actor_id,actor_name,source_table,source_record_id,summary,payload
  ) values (
    p_organization_id,p_work_order_id,v_wo.canonical_asset_id,
    'timer_pause_review_required',v_now,p_actor_id,
    nullif(trim(coalesce(p_actor_name, '')),''),
    'public.maintenance_work_orders',p_work_order_id::text,
    'Pausa registrada: sesión prolongada sin tiempo efectivo confirmado',
    jsonb_build_object(
      'action','pause','previous_status','running','new_status','paused',
      'notes',trim(p_notes),'timer_start_time',v_wo.timer_start_time,
      'unverified_elapsed_seconds',v_elapsed,'credited_seconds_before',v_credited,
      'requires_mechanic_declaration',true
    )
  );

  return jsonb_build_object(
    'ok',true,'timer_status','paused','timer_start_time',null,
    'total_seconds',v_credited,'total_minutes',floor(v_credited::numeric/60)::integer,
    'review_required',true,'unverified_elapsed_seconds',v_elapsed
  );
end
$$;

create or replace function public.declare_overlong_work_order_elapsed_time(
  p_organization_id uuid,
  p_work_order_id uuid,
  p_actor_id uuid,
  p_actor_name text default null,
  p_elapsed_seconds integer default null,
  p_notes text default null
) returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_wo public.maintenance_work_orders%rowtype;
  v_event public.work_order_events%rowtype;
  v_unverified integer;
  v_credited integer;
  v_new_seconds integer;
  v_now timestamptz := now();
begin
  if p_elapsed_seconds is null or p_elapsed_seconds < 0 then
    raise exception 'Indica un tiempo trabajado válido' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_notes,''))) < 5 then
    raise exception 'Indica cómo se verificó el tiempo de trabajo' using errcode = '22023';
  end if;
  select * into v_wo from public.maintenance_work_orders
  where id = p_work_order_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Orden no encontrada' using errcode = 'P0002'; end if;
  if v_wo.timer_status <> 'paused' then
    raise exception 'Primero debes pausar el cronómetro' using errcode = '55000';
  end if;

  select * into v_event from public.work_order_events
  where organization_id = p_organization_id and work_order_id = p_work_order_id
    and event_type in ('timer_pause_review_required','timer_duration_declared')
  order by event_at desc,id desc limit 1;
  if not found or v_event.event_type <> 'timer_pause_review_required' then
    raise exception 'No hay un tramo de tiempo pendiente por declarar' using errcode = '55000';
  end if;

  v_unverified := (v_event.payload->>'unverified_elapsed_seconds')::integer;
  v_credited := (v_event.payload->>'credited_seconds_before')::integer;
  if p_elapsed_seconds > v_unverified then
    raise exception 'El tiempo declarado supera el tiempo transcurrido' using errcode = '22023';
  end if;
  if greatest(coalesce(v_wo.total_timer_seconds,0),coalesce(v_wo.total_timer_minutes,0)*60) <> v_credited then
    raise exception 'El cronómetro cambió. Actualiza antes de declarar las horas' using errcode = '55000';
  end if;

  v_new_seconds := v_credited + p_elapsed_seconds;
  update public.maintenance_work_orders
  set total_timer_seconds = v_new_seconds,
      total_timer_minutes = floor(v_new_seconds::numeric/60)::integer,
      actual_duration_hours = v_new_seconds::numeric/3600,
      updated_at = v_now
  where id = p_work_order_id and organization_id = p_organization_id;

  insert into public.work_order_events(
    organization_id,work_order_id,canonical_asset_id,event_type,event_at,
    actor_id,actor_name,source_table,source_record_id,summary,payload
  ) values (
    p_organization_id,p_work_order_id,v_wo.canonical_asset_id,
    'timer_duration_declared',v_now,p_actor_id,
    nullif(trim(coalesce(p_actor_name, '')),''),
    'public.maintenance_work_orders',p_work_order_id::text,
    'Tiempo efectivo declarado por el ejecutor para revisión de jefatura',
    jsonb_build_object(
      'pause_event_id',v_event.id,'declared_elapsed_seconds',p_elapsed_seconds,
      'total_seconds',v_new_seconds,'credited_seconds_before',v_credited,
      'notes',trim(p_notes),'source','mechanic_declared_not_measured'
    )
  );
  return jsonb_build_object(
    'ok',true,'timer_status','paused','timer_start_time',null,
    'total_seconds',v_new_seconds,'total_minutes',floor(v_new_seconds::numeric/60)::integer,
    'review_required',false,'mechanic_declared',true
  );
end
$$;

revoke all on function public.pause_overlong_work_order_timer_for_review(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.pause_overlong_work_order_timer_for_review(uuid,uuid,uuid,text,text) to service_role;
revoke all on function public.declare_overlong_work_order_elapsed_time(uuid,uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.declare_overlong_work_order_elapsed_time(uuid,uuid,uuid,text,integer,text) to service_role;
commit;
