-- MOTIL OT production health canary (READ ONLY)
-- Purpose: detect work orders that can trap users or break the review chain.
-- Do not mutate production from this script.

with checks as (
  select 'running_without_start_time' as check_name, count(*)::bigint as count
  from public.maintenance_work_orders
  where timer_status='running' and timer_start_time is null

  union all
  select 'paused_with_start_time', count(*)::bigint
  from public.maintenance_work_orders
  where timer_status='paused' and timer_start_time is not null

  union all
  select 'completed_timer_not_idle', count(*)::bigint
  from public.maintenance_work_orders
  where status='completed' and coalesce(timer_status,'idle') <> 'idle'

  union all
  select 'in_progress_without_assignee', count(*)::bigint
  from public.maintenance_work_orders
  where status='in_progress' and assigned_person_id is null

  union all
  select 'equipment_work_without_asset', count(*)::bigint
  from public.maintenance_work_orders
  where status in ('open','in_progress')
    and coalesce(work_type,'') <> 'general'
    and canonical_asset_id is null

  union all
  select 'completed_without_review', count(*)::bigint
  from public.maintenance_work_orders wo
  left join public.work_order_supervisor_reviews r
    on r.organization_id=wo.organization_id and r.work_order_id=wo.id
  where wo.status='completed' and r.id is null

  union all
  select 'approved_review_non_completed_wo', count(*)::bigint
  from public.work_order_supervisor_reviews r
  join public.maintenance_work_orders wo
    on wo.organization_id=r.organization_id and wo.id=r.work_order_id
  where r.status='approved' and wo.status <> 'completed'

  union all
  select 'rejected_review_not_reopened', count(*)::bigint
  from public.work_order_supervisor_reviews r
  join public.maintenance_work_orders wo
    on wo.organization_id=r.organization_id and wo.id=r.work_order_id
  where r.status='rejected' and wo.status <> 'in_progress'
)
select * from checks order by check_name;

-- Separate concurrency check:
-- select assigned_person_id, count(*) as running_count
-- from public.maintenance_work_orders
-- where timer_status='running' and assigned_person_id is not null
-- group by assigned_person_id
-- having count(*) > 1;
