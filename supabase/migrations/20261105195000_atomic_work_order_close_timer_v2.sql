begin;

create or replace function public.close_work_order_with_timer_v2(
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
  v_wo public.maintenance_work_orders%rowtype;
  v_timer_hours numeric := 0;
  v_requested_hours numeric := 0;
  v_effective_hours numeric := 0;
begin
  select *
    into v_wo
    from public.maintenance_work_orders
   where id = p_work_order_id
     and organization_id = p_organization_id
   for update;

  if not found then
    raise exception 'Orden no encontrada' using errcode = 'P0002';
  end if;

  if coalesce(v_wo.timer_status, 'idle') in ('running', 'paused') then
    perform public.update_work_order_timer(
      p_organization_id,
      p_work_order_id,
      'terminate',
      p_actor_id,
      p_actor_name,
      'Cierre de OT'
    );
  end if;

  select *
    into v_wo
    from public.maintenance_work_orders
   where id = p_work_order_id
     and organization_id = p_organization_id
   for update;

  v_timer_hours := greatest(
    coalesce(v_wo.actual_duration_hours, 0),
    coalesce(v_wo.total_timer_seconds, 0)::numeric / 3600,
    coalesce(v_wo.total_timer_minutes, 0)::numeric / 60
  );
  v_requested_hours := case
    when p_actual_duration_hours is not null and p_actual_duration_hours > 0
      then p_actual_duration_hours
    else 0
  end;
  v_effective_hours := greatest(v_timer_hours, v_requested_hours);

  update public.maintenance_work_orders
     set actual_duration_hours = v_effective_hours,
         root_cause = case when p_root_cause is null then root_cause else p_root_cause end,
         preventive_actions = case when p_preventive_actions is null then preventive_actions else p_preventive_actions end,
         updated_at = now()
   where id = p_work_order_id
     and organization_id = p_organization_id;

  -- close_work_order_safely performs all final close validations and mutations.
  -- Any exception raised there aborts this entire function call, rolling back
  -- timer termination and the detail update above.
  perform public.close_work_order_safely(p_work_order_id);

  return p_work_order_id;
end;
$function$;

revoke all on function public.close_work_order_with_timer_v2(uuid, uuid, uuid, text, numeric, text, text) from public, anon, authenticated;
grant execute on function public.close_work_order_with_timer_v2(uuid, uuid, uuid, text, numeric, text, text) to service_role;

comment on function public.close_work_order_with_timer_v2(uuid, uuid, uuid, text, numeric, text, text) is
'Atomically terminates the OT timer, preserves active-work duration semantics, applies closure details, and closes the work order. Wall-clock elapsed time is not promoted to labor duration or availability.';

commit;
