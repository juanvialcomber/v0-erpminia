-- Observability invariant: every actionable owner task should resolve to at least one active profile.
-- This is read-only health evidence; it does not reassign tasks or profiles.

create or replace view public.role_task_owner_coverage_v1
with (security_invoker = true)
as
with active_profiles as (
  select organization_id,cargo_id,count(*)::bigint as active_profiles
  from public.profiles
  where status='active'
    and cargo_id is not null
  group by organization_id,cargo_id
),
owner_tasks as (
  select
    t.organization_id,
    t.cargo_id,
    t.cargo_name,
    count(*)::bigint as owner_tasks,
    count(*) filter (where t.severity='critical')::bigint as critical_tasks,
    max(t.priority_score) as max_priority
  from public.role_tasks_actionable_v1 t
  where t.status='pending'
    and t.responsibility='owner'
  group by t.organization_id,t.cargo_id,t.cargo_name
)
select
  o.organization_id,
  o.cargo_id,
  o.cargo_name,
  o.owner_tasks,
  o.critical_tasks,
  o.max_priority,
  coalesce(p.active_profiles,0::bigint) as active_profiles,
  (coalesce(p.active_profiles,0::bigint)>0) as has_active_owner
from owner_tasks o
left join active_profiles p
  on p.organization_id=o.organization_id
 and p.cargo_id=o.cargo_id;

revoke all on public.role_task_owner_coverage_v1 from public,anon,authenticated;
grant select on public.role_task_owner_coverage_v1 to service_role;

comment on view public.role_task_owner_coverage_v1
is 'Read-only control proving whether every actionable owner task resolves to at least one active profile.';
