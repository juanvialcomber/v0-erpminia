-- Enforce the server invariant already used by the maintenance API:
-- one canonical assignee may have at most one OT recording time.
-- Diagnosis on 2026-11-09 confirmed no duplicate running timers before creation.
create unique index if not exists maintenance_work_orders_one_running_timer_per_person_uidx
  on public.maintenance_work_orders (organization_id, assigned_person_id)
  where timer_status = 'running'
    and assigned_person_id is not null;
