begin;

create or replace function public.cancel_work_order_safely_v1(
  p_organization_id uuid,
  p_work_order_id uuid,
  p_actor_id uuid,
  p_actor_name text default null,
  p_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_wo public.maintenance_work_orders%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_now timestamptz := now();
begin
  if v_reason is null then
    raise exception 'Indica el motivo de anulación de la OT' using errcode = '22023';
  end if;

  select *
    into v_wo
    from public.maintenance_work_orders
   where id = p_work_order_id
     and organization_id = p_organization_id
   for update;

  if not found then
    raise exception 'Orden no encontrada' using errcode = 'P0002';
  end if;

  if lower(coalesce(v_wo.status, '')) in ('completed', 'closed') then
    raise exception 'Una OT completada no puede anularse' using errcode = '55000';
  end if;

  if lower(coalesce(v_wo.status, '')) in ('cancelled', 'canceled') then
    return p_work_order_id;
  end if;

  if coalesce(v_wo.timer_status, 'idle') in ('running', 'paused') then
    perform public.update_work_order_timer(
      p_organization_id,
      p_work_order_id,
      'terminate',
      p_actor_id,
      p_actor_name,
      'Anulación de OT: ' || v_reason
    );
  end if;

  update public.maintenance_work_orders
     set status = 'cancelled',
         updated_at = v_now
   where id = p_work_order_id
     and organization_id = p_organization_id;

  insert into public.work_order_events (
    organization_id, work_order_id, canonical_asset_id, event_type, event_at,
    actor_id, actor_name, source_table, source_record_id, summary, payload
  ) values (
    p_organization_id, p_work_order_id, v_wo.canonical_asset_id,
    'work_order_cancelled', v_now, p_actor_id,
    nullif(trim(coalesce(p_actor_name, '')), ''),
    'public.maintenance_work_orders', p_work_order_id::text,
    'Orden anulada por usuario autorizado',
    jsonb_build_object(
      'reason', v_reason,
      'previous_status', v_wo.status,
      'previous_timer_status', coalesce(v_wo.timer_status, 'idle'),
      'timer_terminated', coalesce(v_wo.timer_status, 'idle') in ('running', 'paused')
    )
  );

  return p_work_order_id;
end;
$function$;

revoke all on function public.cancel_work_order_safely_v1(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.cancel_work_order_safely_v1(uuid, uuid, uuid, text, text)
  to service_role;

comment on function public.cancel_work_order_safely_v1(uuid, uuid, uuid, text, text) is
'Atomically terminates an active OT timer, cancels the work order and records the human cancellation reason.';

commit;
