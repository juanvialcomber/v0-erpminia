-- Cancel operational work orders atomically: state + reason + audit event.
create or replace function public.cancel_work_order_safely(
  p_organization_id uuid,
  p_work_order_id uuid,
  p_reason text,
  p_actor_id uuid default null::uuid,
  p_actor_name text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_wo public.maintenance_work_orders%rowtype;
  v_now timestamptz := now();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_reason is null or char_length(v_reason) < 5 then
    raise exception 'Indica el motivo de la anulación (mínimo 5 caracteres).' using errcode = '22023';
  end if;

  select *
    into v_wo
    from public.maintenance_work_orders
   where organization_id = p_organization_id
     and id = p_work_order_id
   for update;

  if not found then
    raise exception 'Work order not found' using errcode = 'P0002';
  end if;

  if v_wo.created_by is null then
    raise exception 'La OT histórica es de solo lectura' using errcode = '55000';
  end if;

  if lower(coalesce(v_wo.status, '')) in ('completed', 'closed', 'cancelled', 'canceled') then
    raise exception 'La OT ya está finalizada o anulada' using errcode = '55000';
  end if;

  if lower(coalesce(v_wo.timer_status, 'idle')) <> 'idle' then
    raise exception 'Detén el cronómetro antes de anular la OT para preservar el tiempo registrado' using errcode = '55000';
  end if;

  update public.maintenance_work_orders
     set status = 'cancelled',
         cancellation_reason = v_reason,
         cancelled_at = v_now,
         updated_at = v_now
   where organization_id = p_organization_id
     and id = p_work_order_id;

  insert into public.work_order_events (
    organization_id,
    work_order_id,
    canonical_asset_id,
    event_type,
    event_at,
    actor_id,
    actor_name,
    source_table,
    source_record_id,
    summary,
    payload
  ) values (
    p_organization_id,
    p_work_order_id,
    v_wo.canonical_asset_id,
    'work_order_cancelled',
    v_now,
    p_actor_id,
    nullif(trim(coalesce(p_actor_name, '')), ''),
    'public.maintenance_work_orders',
    p_work_order_id::text,
    'Orden anulada por usuario autorizado',
    jsonb_build_object('reason', v_reason)
  );

  return jsonb_build_object(
    'ok', true,
    'work_order_id', p_work_order_id,
    'status', 'cancelled',
    'cancellation_reason', v_reason,
    'cancelled_at', v_now
  );
end;
$function$;

revoke all on function public.cancel_work_order_safely(uuid, uuid, text, uuid, text) from public;
revoke all on function public.cancel_work_order_safely(uuid, uuid, text, uuid, text) from authenticated;
grant execute on function public.cancel_work_order_safely(uuid, uuid, text, uuid, text) to service_role;
