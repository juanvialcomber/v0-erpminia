-- Keep OT lifecycle status and timer state coupled at the database boundary.
-- No historical rows are rewritten. Future transitions only.

create or replace function public.enforce_work_order_lifecycle_assignment()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_status text := lower(coalesce(new.status, ''));
  v_timer_status text := lower(coalesce(new.timer_status, 'idle'));
begin
  if new.status is distinct from old.status then
    if v_status = 'closed' then
      raise exception 'El estado closed es legacy; cierre la OT mediante el flujo canónico completed'
        using errcode = '55000';
    end if;

    if v_status in ('in_progress', 'completed')
       and new.assigned_person_id is null then
      raise exception 'Asigne un responsable antes de iniciar o completar la OT'
        using errcode = '55000';
    end if;
  end if;

  if v_timer_status in ('running', 'paused') and v_status <> 'in_progress' then
    raise exception 'El cronómetro sólo puede estar activo o pausado mientras la OT está en progreso'
      using errcode = '55000';
  end if;

  if v_status in ('completed', 'closed', 'cancelled', 'canceled')
     and v_timer_status <> 'idle' then
    raise exception 'Finalice el cronómetro antes de cerrar o anular la OT'
      using errcode = '55000';
  end if;

  return new;
end;
$function$;

drop trigger if exists maintenance_work_orders_lifecycle_assignment_guard
  on public.maintenance_work_orders;

create trigger maintenance_work_orders_lifecycle_assignment_guard
before update of status, timer_status on public.maintenance_work_orders
for each row
execute function public.enforce_work_order_lifecycle_assignment();
