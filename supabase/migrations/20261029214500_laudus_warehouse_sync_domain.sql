-- Add bounded read-only Laudus warehouse sync.
-- Warehouses remain staging/reconciliation evidence; no canonical promotion occurs here.

insert into integration.sync_policies (
  organization_id, source_id, domain, schedule_cron, schedule_timezone,
  freshness_sla_minutes, max_runtime_seconds, max_attempts, batch_size, run_order, scope
)
select
  s.organization_id,
  s.id,
  'warehouses',
  '50 6 * * 0',
  'UTC',
  11520,
  120,
  3,
  100,
  45,
  '{"read_only":true,"mode":"weekly_full","max_pages":1}'::jsonb
from integration.external_sources s
where s.source_key='laudus'
on conflict (source_id, domain) do update set
  enabled=excluded.enabled,
  schedule_cron=excluded.schedule_cron,
  schedule_timezone=excluded.schedule_timezone,
  freshness_sla_minutes=excluded.freshness_sla_minutes,
  max_runtime_seconds=excluded.max_runtime_seconds,
  max_attempts=excluded.max_attempts,
  batch_size=excluded.batch_size,
  run_order=excluded.run_order,
  scope=excluded.scope,
  updated_at=now();

create or replace function public.motil_record_laudus_sync_control(
  p_organization_id uuid,
  p_domain text,
  p_event text,
  p_run_id uuid default null,
  p_processed bigint default 0,
  p_changed bigint default 0,
  p_conflicts bigint default 0,
  p_api_calls integer default 0,
  p_error text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, pg_temp
as $$
declare
  v_source_id uuid;
  v_now timestamptz := now();
  v_failures integer := 0;
  v_health text;
  v_incident_id uuid;
  v_occurrences integer;
begin
  if p_domain not in ('products','stock','financial_masters','suppliers','procurement','warehouses') then
    raise exception 'invalid sync domain';
  end if;
  if p_event not in ('running','success','failure') then
    raise exception 'invalid sync event';
  end if;

  select s.id into v_source_id
  from integration.external_sources s
  where s.organization_id=p_organization_id
    and s.source_key='laudus'
    and s.enabled=true
  limit 1;

  if v_source_id is null then raise exception 'laudus source unavailable'; end if;

  if p_event='running' then
    insert into integration.sync_domain_state (
      organization_id, source_id, domain, health_status,
      last_started_at, last_error, updated_at
    ) values (
      p_organization_id, v_source_id, p_domain, 'running',
      v_now, null, v_now
    )
    on conflict (source_id, domain) do update set
      health_status='running',
      last_started_at=excluded.last_started_at,
      last_error=null,
      updated_at=excluded.updated_at;

  elsif p_event='success' then
    insert into integration.sync_domain_state (
      organization_id, source_id, domain, last_run_id, health_status,
      last_success_at, next_due_at, freshness_observed_at,
      records_processed, records_changed, conflicts, api_calls,
      consecutive_failures, last_error, metadata, updated_at
    ) values (
      p_organization_id, v_source_id, p_domain, p_run_id, 'healthy',
      v_now,
      case
        when p_domain in ('suppliers','warehouses') then v_now + interval '7 days'
        when p_domain in ('financial_masters','procurement') then v_now + interval '24 hours'
        when p_domain='products' then v_now + interval '12 hours'
        else v_now + interval '6 hours'
      end,
      v_now,
      greatest(coalesce(p_processed,0),0),
      greatest(coalesce(p_changed,0),0),
      greatest(coalesce(p_conflicts,0),0),
      greatest(coalesce(p_api_calls,0),0),
      0, null, coalesce(p_metadata,'{}'::jsonb), v_now
    )
    on conflict (source_id, domain) do update set
      last_run_id=excluded.last_run_id,
      health_status='healthy',
      last_success_at=excluded.last_success_at,
      next_due_at=excluded.next_due_at,
      freshness_observed_at=excluded.freshness_observed_at,
      records_processed=excluded.records_processed,
      records_changed=excluded.records_changed,
      conflicts=excluded.conflicts,
      api_calls=excluded.api_calls,
      consecutive_failures=0,
      last_error=null,
      metadata=excluded.metadata,
      updated_at=excluded.updated_at;

    update integration.sync_incidents
    set status='resolved',
        resolved_at=v_now,
        last_seen_at=v_now,
        updated_at=v_now
    where source_id=v_source_id
      and domain=p_domain
      and status='open';

  else
    select coalesce(st.consecutive_failures,0)+1
      into v_failures
    from integration.sync_domain_state st
    where st.source_id=v_source_id and st.domain=p_domain;

    v_failures := coalesce(v_failures,1);
    v_health := case when v_failures >= 3 then 'broken' else 'degraded' end;

    insert into integration.sync_domain_state (
      organization_id, source_id, domain, last_run_id, health_status,
      last_failure_at, records_processed, records_changed, conflicts,
      api_calls, consecutive_failures, last_error, metadata, updated_at
    ) values (
      p_organization_id, v_source_id, p_domain, p_run_id, v_health,
      v_now,
      greatest(coalesce(p_processed,0),0),
      greatest(coalesce(p_changed,0),0),
      greatest(coalesce(p_conflicts,0),0),
      greatest(coalesce(p_api_calls,0),0),
      v_failures,
      left(coalesce(p_error,'Unknown Laudus sync failure'),1000),
      coalesce(p_metadata,'{}'::jsonb),
      v_now
    )
    on conflict (source_id, domain) do update set
      last_run_id=excluded.last_run_id,
      health_status=excluded.health_status,
      last_failure_at=excluded.last_failure_at,
      records_processed=excluded.records_processed,
      records_changed=excluded.records_changed,
      conflicts=excluded.conflicts,
      api_calls=excluded.api_calls,
      consecutive_failures=excluded.consecutive_failures,
      last_error=excluded.last_error,
      metadata=excluded.metadata,
      updated_at=excluded.updated_at;

    select i.id, i.occurrence_count into v_incident_id, v_occurrences
    from integration.sync_incidents i
    where i.source_id=v_source_id
      and i.domain=p_domain
      and i.fingerprint=p_domain || ':sync_failure'
      and i.status='open'
    limit 1;

    if v_incident_id is null then
      insert into integration.sync_incidents (
        organization_id, source_id, domain, fingerprint, category,
        severity, status, message, details, first_seen_at, last_seen_at,
        occurrence_count, last_run_id, created_at, updated_at
      ) values (
        p_organization_id, v_source_id, p_domain, p_domain || ':sync_failure',
        'sync_failure',
        case when v_failures >= 3 then 'critical' else 'error' end,
        'open',
        left(coalesce(p_error,'Unknown Laudus sync failure'),1000),
        coalesce(p_metadata,'{}'::jsonb),
        v_now, v_now, 1, p_run_id, v_now, v_now
      );
    else
      update integration.sync_incidents
      set severity=case when v_failures >= 3 then 'critical' else 'error' end,
          message=left(coalesce(p_error,'Unknown Laudus sync failure'),1000),
          details=coalesce(p_metadata,'{}'::jsonb),
          last_seen_at=v_now,
          occurrence_count=greatest(coalesce(v_occurrences,1),1)+1,
          last_run_id=p_run_id,
          updated_at=v_now
      where id=v_incident_id;
    end if;
  end if;

  return jsonb_build_object(
    'source_id', v_source_id,
    'domain', p_domain,
    'event', p_event,
    'health_status', case
      when p_event='success' then 'healthy'
      when p_event='failure' then v_health
      else 'running'
    end,
    'consecutive_failures', case when p_event='failure' then v_failures else 0 end
  );
end;
$$;

revoke all on function public.motil_record_laudus_sync_control(
  uuid,text,text,uuid,bigint,bigint,bigint,integer,text,jsonb
) from public, anon, authenticated;
grant execute on function public.motil_record_laudus_sync_control(
  uuid,text,text,uuid,bigint,bigint,bigint,integer,text,jsonb
) to service_role;
