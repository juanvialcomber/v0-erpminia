begin;

create or replace view public.preventive_maintenance_hour_status_v1
with (security_invoker=true) as
with latest_runtime as (
  select distinct on (r.organization_id,r.canonical_asset_id)
    r.organization_id,
    r.canonical_asset_id,
    r.meter_hours,
    r.recorded_at,
    r.source_type,
    r.source_reference
  from public.asset_runtime_readings r
  order by r.organization_id,r.canonical_asset_id,r.recorded_at desc,r.created_at desc
),
latest_planning as (
  select distinct on (p.organization_id,p.canonical_asset_id)
    p.organization_id,
    p.canonical_asset_id,
    p.meter_value,
    p.recorded_at,
    p.source_kind,
    p.source_reference
  from public.planning_asset_meter_readings p
  where p.meter_unit='h'
    and p.meter_value is not null
  order by p.organization_id,p.canonical_asset_id,p.recorded_at desc,p.created_at desc
),
meter_evidence as (
  select
    s.organization_id,
    s.id as schedule_id,
    case
      when lr.recorded_at is not null
       and (lp.recorded_at is null or lr.recorded_at >= lp.recorded_at)
        then lr.meter_hours
      when lp.recorded_at is not null then lp.meter_value
      else null
    end as evidence_meter,
    case
      when lr.recorded_at is not null
       and (lp.recorded_at is null or lr.recorded_at >= lp.recorded_at)
        then 'runtime_reading'::text
      when lp.recorded_at is not null then 'planning_reading'::text
      else 'schedule_snapshot'::text
    end as evidence_source
  from public.preventive_maintenance_schedules s
  left join latest_runtime lr
    on lr.organization_id=s.organization_id
   and lr.canonical_asset_id=s.canonical_asset_id
  left join latest_planning lp
    on lp.organization_id=s.organization_id
   and lp.canonical_asset_id=s.canonical_asset_id
)
select
  p.organization_id,
  p.id as schedule_id,
  p.canonical_asset_id,
  a.asset_code,
  a.name as asset_name,
  p.task_name,
  p.description,
  p.priority,
  p.frequency_hours,
  p.last_executed_meter,
  coalesce(
    p.next_due_meter,
    case
      when p.last_executed_meter is not null and p.frequency_hours is not null
        then p.last_executed_meter+p.frequency_hours
    end
  ) as due_meter,
  p.current_meter_snapshot as source_meter_snapshot,
  lr.meter_hours as latest_runtime_meter,
  lr.recorded_at as latest_runtime_recorded_at,
  lr.source_type as latest_runtime_source_type,
  coalesce(me.evidence_meter,p.current_meter_snapshot) as effective_current_meter,
  me.evidence_source as meter_evidence_source,
  (
    me.evidence_meter is not null
    and p.current_meter_snapshot is not null
    and me.evidence_meter < p.current_meter_snapshot
  ) as meter_basis_conflict,
  case
    when p.frequency_hours is null or p.frequency_hours<=0 then 'not_hour_based'
    when coalesce(
      p.next_due_meter,
      case
        when p.last_executed_meter is not null then p.last_executed_meter+p.frequency_hours
      end
    ) is null then 'missing_due_meter'
    when me.evidence_meter is not null
      and p.current_meter_snapshot is not null
      and me.evidence_meter < p.current_meter_snapshot then 'needs_review'
    when coalesce(me.evidence_meter,p.current_meter_snapshot) is null then 'missing_meter'
    when coalesce(me.evidence_meter,p.current_meter_snapshot) >= coalesce(p.next_due_meter,p.last_executed_meter+p.frequency_hours) then 'overdue'
    else 'pending'
  end as hour_status,
  case
    when coalesce(me.evidence_meter,p.current_meter_snapshot) is null then null
    when coalesce(
      p.next_due_meter,
      case
        when p.last_executed_meter is not null then p.last_executed_meter+p.frequency_hours
      end
    ) is null then null
    when me.evidence_meter is not null
      and p.current_meter_snapshot is not null
      and me.evidence_meter < p.current_meter_snapshot then null
    else coalesce(p.next_due_meter,p.last_executed_meter+p.frequency_hours)
      - coalesce(me.evidence_meter,p.current_meter_snapshot)
  end as remaining_hours,
  case
    when p.frequency_hours is null or p.frequency_hours<=0 then false
    when coalesce(
      p.next_due_meter,
      case
        when p.last_executed_meter is not null then p.last_executed_meter+p.frequency_hours
      end
    ) is null then false
    when me.evidence_meter is not null
      and p.current_meter_snapshot is not null
      and me.evidence_meter < p.current_meter_snapshot then false
    when coalesce(me.evidence_meter,p.current_meter_snapshot) is null then false
    else coalesce(me.evidence_meter,p.current_meter_snapshot) >= coalesce(p.next_due_meter,p.last_executed_meter+p.frequency_hours)
  end as alert_due,
  p.source_reference,
  p.generated_work_order_id,
  p.enabled
from public.preventive_maintenance_schedules p
left join public.maintenance_canonical_assets_v1 a
  on a.organization_id=p.organization_id and a.id=p.canonical_asset_id
left join latest_runtime lr
  on lr.organization_id=p.organization_id and lr.canonical_asset_id=p.canonical_asset_id
left join meter_evidence me
  on me.organization_id=p.organization_id and me.schedule_id=p.id
where p.enabled=true and p.frequency_hours is not null and p.frequency_hours>0;

create or replace view public.preventive_maintenance_hour_summary_v1
with (security_invoker=true) as
select
  organization_id,
  count(*)::integer as configured_tasks,
  count(distinct canonical_asset_id)::integer as configured_assets,
  count(*) filter (where hour_status='overdue')::integer as overdue_tasks,
  count(*) filter (where hour_status='pending')::integer as pending_tasks,
  count(*) filter (where hour_status='missing_meter')::integer as missing_meter_tasks,
  count(*) filter (where hour_status='needs_review')::integer as meter_review_tasks,
  count(*) filter (where meter_evidence_source='runtime_reading')::integer as tasks_using_runtime_reading,
  count(*) filter (where meter_evidence_source='planning_reading')::integer as tasks_using_planning_reading
from public.preventive_maintenance_hour_status_v1
group by organization_id;

revoke all privileges on public.preventive_maintenance_hour_status_v1 from public,anon,authenticated;
revoke all privileges on public.preventive_maintenance_hour_summary_v1 from public,anon,authenticated;
grant select on public.preventive_maintenance_hour_status_v1 to service_role;
grant select on public.preventive_maintenance_hour_summary_v1 to service_role;

comment on view public.preventive_maintenance_hour_status_v1 is
  'Hour-based preventive status using the newest trustworthy hour evidence from canonical runtime readings or planning history, while preserving source provenance and conflict detection.';

commit;
