-- Maintenance timer resilience.
-- 1) DB invariant: one canonical assignee may have at most one OT recording time.
-- 2) Atomic handoff: pause the current OT and start/resume the selected OT in one transaction.

do $
begin
  if exists (
    select 1
    from public.maintenance_work_orders
    where timer_status = 'running'
      and assigned_person_id is not null
    group by organization_id, assigned_person_id
    having count(*) > 1
  ) then
    raise exception 'Cannot install timer invariant: duplicate running timers exist by organization/person.';
  end if;
end $;

create unique index if not exists maintenance_work_orders_one_running_timer_per_person_uidx
  on public.maintenance_work_orders (organization_id, assigned_person_id)
  where timer_status = 'running'
    and assigned_person_id is not null;

create or replace function public.switch_work_order_timer(
  p_organization_id uuid,
  p_from_work_order_id uuid,
  p_to_work_order_id uuid,
  p_actor_id uuid default null,
  p_actor_name text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_from public.maintenance_work_orders%rowtype;
  v_to public.maintenance_work_orders%rowtype;
  v_now timestamptz := now();
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_from_elapsed integer := 0;
  v_from_total integer := 0;
  v_to_total integer := 0;
  v_to_event text;
begin
  if p_from_work_order_id = p_to_work_order_id then
    raise exception 'La OT de origen y destino deben ser distintas.' using errcode = '22023';
  end if;
  if v_notes is null or length(v_notes) < 5 then
    raise exception 'Debes indicar por qué cambias de orden de trabajo.' using errcode = '22023';
  end if;

  -- Lock in deterministic UUID order to avoid cross-tab deadlocks.
  perform 1
  from public.maintenance_work_orders
  where organization_id = p_organization_id
    and id in (p_from_work_order_id, p_to_work_order_id)
  order by id
  for update;

  select * into v_from
  from public.maintenance_work_orders
  where organization_id = p_organization_id
    and id = p_from_work_order_id;

  select * into v_to
  from public.maintenance_work_orders
  where organization_id = p_organization_id
    and id = p_to_work_order_id;

  if v_from.id is null or v_to.id is null then
    raise exception 'Work order not found' using errcode = 'P0002';
  end if;
  if v_from.assigned_person_id is null
     or v_to.assigned_person_id is null
     or v_from.assigned_person_id <> v_to.assigned_person_id then
    raise exception 'Las dos OT deben pertenecer a la misma persona asignada.' using errcode = '55000';
  end if;
  if coalesce(v_from.timer_status, 'idle') <> 'running' or v_from.timer_start_time is null then
    raise exception 'La OT actual ya no está registrando tiempo. Actualiza la página.' using errcode = '55000';
  end if;
  if lower(coalesce(v_to.status, '')) in ('completed','closed','cancelled','canceled') then
    raise exception 'No se puede iniciar una OT finalizada o cancelada.' using errcode = '55000';
  end if;

  -- Re-evaluate start-readiness from the locked target row so the decision and
  -- timer transition share the same transaction snapshot.
  if lower(coalesce(v_to.work_type, '')) <> 'general' and v_to.canonical_asset_id is null then
    raise exception 'La OT destino no está preparada: falta activo canónico.' using errcode = '55000';
  end if;
  if v_to.assigned_person_id is null then
    raise exception 'La OT destino no está preparada: falta responsable.' using errcode = '55000';
  end if;
  if lower(coalesce(v_to.work_type, '')) <> 'emergency' and v_to.scheduled_date is null then
    raise exception 'La OT destino no está preparada: falta fecha programada.' using errcode = '55000';
  end if;

  if coalesce(v_to.timer_status, 'idle') not in ('idle','paused') then
    raise exception 'La OT destino no está disponible para iniciar o reanudar.' using errcode = '55000';
  end if;

  v_from_total := greatest(coalesce(v_from.total_timer_seconds, 0), coalesce(v_from.total_timer_minutes, 0) * 60);
  v_from_elapsed := greatest(0, floor(extract(epoch from (v_now - v_from.timer_start_time)))::integer);
  v_from_total := v_from_total + v_from_elapsed;

  update public.maintenance_work_orders
  set timer_status = 'paused',
      timer_start_time = null,
      total_timer_seconds = v_from_total,
      total_timer_minutes = floor(v_from_total::numeric / 60)::integer,
      actual_duration_hours = v_from_total::numeric / 3600,
      updated_at = v_now
  where id = v_from.id
    and organization_id = p_organization_id;

  insert into public.work_order_events (
    organization_id, work_order_id, canonical_asset_id, event_type, event_at,
    actor_id, actor_name, source_table, source_record_id, summary, payload
  ) values (
    p_organization_id, v_from.id, v_from.canonical_asset_id, 'timer_pause', v_now,
    p_actor_id, nullif(trim(coalesce(p_actor_name, '')), ''),
    'public.maintenance_work_orders', v_from.id::text,
    'Trabajo pausado: ' || v_notes,
    jsonb_build_object(
      'action','pause','previous_status','running','new_status','paused',
      'elapsed_seconds',v_from_elapsed,'total_seconds',v_from_total,
      'elapsed_minutes',floor(v_from_elapsed::numeric / 60)::integer,
      'total_minutes',floor(v_from_total::numeric / 60)::integer,
      'notes',v_notes,'handoff_to_work_order_id',v_to.id
    )
  );

  v_to_total := greatest(coalesce(v_to.total_timer_seconds, 0), coalesce(v_to.total_timer_minutes, 0) * 60);
  v_to_event := case when coalesce(v_to.timer_status, 'idle') = 'paused' then 'timer_resume' else 'timer_play' end;

  update public.maintenance_work_orders
  set status = case
        when lower(coalesce(status,'')) in ('open','assigned','pending','planned') then 'in_progress'
        else status
      end,
      start_date = case
        when lower(coalesce(status,'')) in ('open','assigned','pending','planned') then coalesce(start_date, v_now at time zone 'utc')
        else start_date
      end,
      timer_status = 'running',
      timer_start_time = v_now,
      total_timer_seconds = v_to_total,
      total_timer_minutes = floor(v_to_total::numeric / 60)::integer,
      actual_duration_hours = v_to_total::numeric / 3600,
      updated_at = v_now
  where id = v_to.id
    and organization_id = p_organization_id;

  insert into public.work_order_events (
    organization_id, work_order_id, canonical_asset_id, event_type, event_at,
    actor_id, actor_name, source_table, source_record_id, summary, payload
  ) values (
    p_organization_id, v_to.id, v_to.canonical_asset_id, v_to_event, v_now,
    p_actor_id, nullif(trim(coalesce(p_actor_name, '')), ''),
    'public.maintenance_work_orders', v_to.id::text,
    case when v_to_event = 'timer_resume'
      then 'Temporizador de trabajo reanudado'
      else 'Temporizador de trabajo iniciado'
    end,
    jsonb_build_object(
      'action',case when v_to_event = 'timer_resume' then 'resume' else 'play' end,
      'previous_status',coalesce(v_to.timer_status,'idle'),
      'new_status','running','elapsed_seconds',0,'total_seconds',v_to_total,
      'elapsed_minutes',0,'total_minutes',floor(v_to_total::numeric / 60)::integer,
      'notes',null,'handoff_from_work_order_id',v_from.id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'from_work_order_id', v_from.id,
    'to_work_order_id', v_to.id,
    'from_timer_status', 'paused',
    'to_timer_status', 'running',
    'switched_at', v_now
  );
end;
$function$;

revoke all on function public.switch_work_order_timer(uuid,uuid,uuid,uuid,text,text) from public;
revoke all on function public.switch_work_order_timer(uuid,uuid,uuid,uuid,text,text) from anon;
revoke all on function public.switch_work_order_timer(uuid,uuid,uuid,uuid,text,text) from authenticated;
grant execute on function public.switch_work_order_timer(uuid,uuid,uuid,uuid,text,text) to service_role;
