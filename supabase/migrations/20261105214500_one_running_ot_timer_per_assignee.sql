begin;

create unique index if not exists maintenance_work_orders_one_running_timer_per_assignee_idx
  on public.maintenance_work_orders (organization_id, assigned_person_id)
  where timer_status = 'running'
    and assigned_person_id is not null;

comment on index public.maintenance_work_orders_one_running_timer_per_assignee_idx is
  'Enforces at most one running OT timer per assigned executor inside the database, including concurrent starts/resumes.';

commit;
