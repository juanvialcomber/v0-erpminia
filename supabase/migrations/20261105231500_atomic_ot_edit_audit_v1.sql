begin;

create or replace function public.update_work_order_with_audit_v1(
  p_organization_id uuid,
  p_work_order_id uuid,
  p_actor_id uuid,
  p_actor_name text default null,
  p_changes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_before public.maintenance_work_orders%rowtype;
  v_after public.maintenance_work_orders%rowtype;
  v_previous jsonb := '{}'::jsonb;
  v_next jsonb := '{}'::jsonb;
  v_change_details jsonb := '{}'::jsonb;
  v_changed_fields jsonb := '[]'::jsonb;
  v_key text;
begin
  if p_changes is null or p_changes = '{}'::jsonb then
    return p_work_order_id;
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_changes) as k(key)
    where k.key not in (
      'status','title','description','work_type','priority','scheduled_date',
      'assigned_person_id','assigned_to_name','cost_center_id',
      'actual_duration_hours','root_cause','preventive_actions','meter_reading','meter_unit'
    )
  ) then
    raise exception 'Cambio de OT no permitido' using errcode = '22023';
  end if;

  select *
    into v_before
    from public.maintenance_work_orders
   where id = p_work_order_id
     and organization_id = p_organization_id
   for update;

  if not found then
    raise exception 'Orden no encontrada' using errcode = 'P0002';
  end if;

  for v_key in select jsonb_object_keys(p_changes)
  loop
    v_previous := v_previous || jsonb_build_object(v_key, to_jsonb(v_before)->v_key);
  end loop;

  update public.maintenance_work_orders
     set status = case when p_changes ? 'status' then p_changes->>'status' else status end,
         title = case when p_changes ? 'title' then p_changes->>'title' else title end,
         description = case when p_changes ? 'description' then nullif(p_changes->>'description','') else description end,
         work_type = case when p_changes ? 'work_type' then nullif(p_changes->>'work_type','') else work_type end,
         priority = case when p_changes ? 'priority' then nullif(p_changes->>'priority','') else priority end,
         scheduled_date = case when p_changes ? 'scheduled_date' then nullif(p_changes->>'scheduled_date','')::date else scheduled_date end,
         assigned_person_id = case when p_changes ? 'assigned_person_id' then nullif(p_changes->>'assigned_person_id','')::uuid else assigned_person_id end,
         assigned_to_name = case when p_changes ? 'assigned_to_name' then nullif(p_changes->>'assigned_to_name','') else assigned_to_name end,
         cost_center_id = case when p_changes ? 'cost_center_id' then nullif(p_changes->>'cost_center_id','')::uuid else cost_center_id end,
         actual_duration_hours = case when p_changes ? 'actual_duration_hours' then nullif(p_changes->>'actual_duration_hours','')::numeric else actual_duration_hours end,
         root_cause = case when p_changes ? 'root_cause' then nullif(p_changes->>'root_cause','') else root_cause end,
         preventive_actions = case when p_changes ? 'preventive_actions' then nullif(p_changes->>'preventive_actions','') else preventive_actions end,
         meter_reading = case when p_changes ? 'meter_reading' then nullif(p_changes->>'meter_reading','')::numeric else meter_reading end,
         meter_unit = case when p_changes ? 'meter_unit' then nullif(p_changes->>'meter_unit','') else meter_unit end,
         updated_at = now()
   where id = p_work_order_id
     and organization_id = p_organization_id
   returning * into v_after;

  for v_key in select jsonb_object_keys(p_changes)
  loop
    v_next := v_next || jsonb_build_object(v_key, to_jsonb(v_after)->v_key);
    if (v_previous->v_key) is distinct from (to_jsonb(v_after)->v_key) then
      v_changed_fields := v_changed_fields || jsonb_build_array(v_key);
      v_change_details := v_change_details || jsonb_build_object(
        v_key,
        jsonb_build_object('previous', v_previous->v_key, 'next', to_jsonb(v_after)->v_key)
      );
    end if;
  end loop;

  if jsonb_array_length(v_changed_fields) > 0 then
    insert into public.work_order_events (
      organization_id, work_order_id, canonical_asset_id, event_type, event_at,
      actor_id, actor_name, source_table, source_record_id, summary, payload
    ) values (
      p_organization_id, p_work_order_id, v_after.canonical_asset_id,
      'work_order_updated', now(), p_actor_id,
      nullif(trim(coalesce(p_actor_name,'')), ''),
      'public.maintenance_work_orders', p_work_order_id::text,
      'Orden actualizada por usuario autorizado',
      jsonb_build_object(
        'changed_fields', v_changed_fields,
        'changes', v_change_details
      )
    );
  end if;

  return p_work_order_id;
end;
$function$;

revoke all on function public.update_work_order_with_audit_v1(uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_work_order_with_audit_v1(uuid, uuid, uuid, text, jsonb)
  to service_role;

comment on function public.update_work_order_with_audit_v1(uuid, uuid, uuid, text, jsonb) is
'Atomically updates whitelisted OT fields and writes before/after audit evidence in the same transaction.';

commit;
