begin;

create or replace function public.capture_supply_blocker_from_timer_pause_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_notes text := nullif(trim(coalesce(new.payload->>'notes','')), '');
  v_detail text;
begin
  if new.event_type <> 'timer_pause' then
    return new;
  end if;

  if v_notes is null or v_notes not like 'Falta de repuesto o material%' then
    return new;
  end if;

  v_detail := nullif(trim(split_part(v_notes, '—', 2)), '');
  if v_detail is null then
    return new;
  end if;

  insert into public.work_order_events(
    organization_id,work_order_id,canonical_asset_id,event_type,event_at,
    actor_id,actor_name,source_table,source_record_id,summary,payload
  ) values (
    new.organization_id,new.work_order_id,new.canonical_asset_id,
    'supply_blocker_reported',new.event_at,
    new.actor_id,new.actor_name,
    'work_order_events',new.id::text,
    'Pausa por repuesto o material pendiente de formalizar',
    jsonb_build_object(
      'source','timer_pause',
      'detail',v_detail,
      'requires_supply_followup',true,
      'canonical_product_id',null
    )
  );

  return new;
end;
$function$;

drop trigger if exists trg_capture_supply_blocker_from_timer_pause_v1
  on public.work_order_events;

create trigger trg_capture_supply_blocker_from_timer_pause_v1
after insert on public.work_order_events
for each row
when (new.event_type = 'timer_pause')
execute function public.capture_supply_blocker_from_timer_pause_v1();

revoke all on function public.capture_supply_blocker_from_timer_pause_v1()
  from public, anon, authenticated;
grant execute on function public.capture_supply_blocker_from_timer_pause_v1()
  to service_role;

commit;
