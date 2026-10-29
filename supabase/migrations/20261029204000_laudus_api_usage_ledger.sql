create table if not exists integration.laudus_api_usage_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  login_count integer not null default 0 check (login_count >= 0),
  read_count integer not null default 0 check (read_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  endpoint_counts jsonb not null default '{}'::jsonb,
  first_called_at timestamptz,
  last_called_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (source_id, usage_date)
);

create index if not exists laudus_api_usage_daily_org_date_idx
  on integration.laudus_api_usage_daily (organization_id, usage_date desc);

alter table integration.laudus_api_usage_daily enable row level security;
revoke all on integration.laudus_api_usage_daily from public, anon, authenticated;
grant select, insert, update on integration.laudus_api_usage_daily to service_role;

create or replace function public.motil_record_laudus_api_usage(
  p_organization_id uuid,
  p_request_count integer,
  p_login_count integer,
  p_read_count integer,
  p_error_count integer,
  p_endpoint_counts jsonb default '{}'::jsonb,
  p_first_called_at timestamptz default null,
  p_last_called_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, pg_temp
as $$
declare
  v_source_id uuid;
  v_date date := (coalesce(p_last_called_at, now()) at time zone 'America/Santiago')::date;
  v_endpoints jsonb := '{}'::jsonb;
begin
  select s.id into v_source_id
  from integration.external_sources s
  where s.organization_id=p_organization_id and s.source_key='laudus'
  limit 1;

  if v_source_id is null then raise exception 'laudus source unavailable'; end if;

  select coalesce(jsonb_object_agg(key, value::int), '{}'::jsonb)
  into v_endpoints
  from (
    select key, sum(value::int) as value
    from (
      select key, value from jsonb_each_text(coalesce(p_endpoint_counts,'{}'::jsonb))
      union all
      select key, value from jsonb_each_text(coalesce((
        select endpoint_counts
        from integration.laudus_api_usage_daily
        where source_id=v_source_id and usage_date=v_date
      ),'{}'::jsonb))
    ) q
    group by key
  ) merged;

  insert into integration.laudus_api_usage_daily (
    organization_id, source_id, usage_date,
    request_count, login_count, read_count, error_count,
    endpoint_counts, first_called_at, last_called_at, updated_at
  ) values (
    p_organization_id, v_source_id, v_date,
    greatest(coalesce(p_request_count,0),0),
    greatest(coalesce(p_login_count,0),0),
    greatest(coalesce(p_read_count,0),0),
    greatest(coalesce(p_error_count,0),0),
    v_endpoints,
    coalesce(p_first_called_at, now()),
    coalesce(p_last_called_at, now()),
    now()
  )
  on conflict (source_id, usage_date) do update set
    request_count=integration.laudus_api_usage_daily.request_count + excluded.request_count,
    login_count=integration.laudus_api_usage_daily.login_count + excluded.login_count,
    read_count=integration.laudus_api_usage_daily.read_count + excluded.read_count,
    error_count=integration.laudus_api_usage_daily.error_count + excluded.error_count,
    endpoint_counts=excluded.endpoint_counts,
    first_called_at=least(integration.laudus_api_usage_daily.first_called_at, excluded.first_called_at),
    last_called_at=greatest(integration.laudus_api_usage_daily.last_called_at, excluded.last_called_at),
    updated_at=now();

  return jsonb_build_object('source_id',v_source_id,'usage_date',v_date,'recorded',p_request_count);
end;
$$;

revoke all on function public.motil_record_laudus_api_usage(uuid,integer,integer,integer,integer,jsonb,timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.motil_record_laudus_api_usage(uuid,integer,integer,integer,integer,jsonb,timestamptz,timestamptz)
  to service_role;

create or replace view public.laudus_api_budget_service_v1
with (security_invoker = true)
as
select
  s.organization_id,
  2000::integer as monthly_limit,
  coalesce(sum(u.request_count) filter (
    where u.usage_date >= date_trunc('month', current_date)::date
  ),0)::integer as tracked_calls_this_month,
  greatest(2000 - coalesce(sum(u.request_count) filter (
    where u.usage_date >= date_trunc('month', current_date)::date
  ),0),0)::integer as tracked_remaining,
  min(u.first_called_at) as exact_tracking_from,
  max(u.last_called_at) as last_call_at,
  coalesce(sum(u.login_count) filter (
    where u.usage_date >= date_trunc('month', current_date)::date
  ),0)::integer as login_calls_this_month,
  coalesce(sum(u.error_count) filter (
    where u.usage_date >= date_trunc('month', current_date)::date
  ),0)::integer as error_calls_this_month
from integration.external_sources s
left join integration.laudus_api_usage_daily u on u.source_id=s.id
where s.source_key='laudus'
group by s.organization_id;

revoke all on public.laudus_api_budget_service_v1 from public, anon, authenticated;
grant select on public.laudus_api_budget_service_v1 to service_role;
