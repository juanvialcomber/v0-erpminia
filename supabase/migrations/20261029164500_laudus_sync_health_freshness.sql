-- Keep sync health freshness anchored to successful runs and materialize next due time.

update integration.sync_domain_state st
set
  freshness_observed_at = coalesce(st.last_success_at, st.freshness_observed_at),
  next_due_at = case
    when st.domain in ('products','stock') and st.last_success_at is not null
      then st.last_success_at + interval '6 hours'
    when st.domain='financial_masters' and st.last_success_at is not null
      then st.last_success_at + interval '24 hours'
    else st.next_due_at
  end,
  health_status = case
    when st.last_success_at is null then 'unknown'
    when now() - st.last_success_at > make_interval(mins => p.freshness_sla_minutes) then 'degraded'
    else 'healthy'
  end,
  updated_at = now()
from integration.sync_policies p
where p.source_id=st.source_id
  and p.domain=st.domain;

create or replace view public.laudus_sync_health_service_v1
with (security_invoker = true)
as
select
  p.organization_id,
  p.source_id,
  p.domain,
  p.enabled,
  p.schedule_cron,
  p.schedule_timezone,
  p.freshness_sla_minutes,
  p.run_order,
  p.scope,
  case
    when st.health_status in ('broken','stuck','running') then st.health_status
    when st.last_success_at is null then 'unknown'
    when now() - st.last_success_at > make_interval(mins => p.freshness_sla_minutes) then 'degraded'
    else coalesce(st.health_status,'unknown')
  end as health_status,
  st.last_run_id,
  st.last_started_at,
  st.last_success_at,
  st.last_failure_at,
  st.next_due_at,
  coalesce(st.freshness_observed_at, st.last_success_at) as freshness_observed_at,
  st.records_processed,
  st.records_changed,
  st.conflicts,
  st.api_calls,
  st.consecutive_failures,
  st.last_error,
  coalesce(inc.open_incidents,0)::bigint as open_incidents,
  coalesce(inc.critical_incidents,0)::bigint as critical_incidents
from integration.sync_policies p
left join integration.sync_domain_state st
  on st.source_id=p.source_id and st.domain=p.domain
left join lateral (
  select
    count(*) filter (where i.status='open') as open_incidents,
    count(*) filter (where i.status='open' and i.severity='critical') as critical_incidents
  from integration.sync_incidents i
  where i.source_id=p.source_id and i.domain=p.domain
) inc on true
where exists (
  select 1 from integration.external_sources s
  where s.id=p.source_id and s.source_key='laudus'
);

revoke all on public.laudus_sync_health_service_v1 from public, anon, authenticated;
grant select on public.laudus_sync_health_service_v1 to service_role;
