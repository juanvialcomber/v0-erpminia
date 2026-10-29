-- Laudus/MOTIL synchronization control plane.
-- Adds policy, current state and incident tracking without mutating canonical inventory.

create table if not exists integration.sync_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete cascade,
  domain text not null,
  enabled boolean not null default true,
  schedule_cron text,
  schedule_timezone text not null default 'UTC',
  freshness_sla_minutes integer not null default 480 check (freshness_sla_minutes > 0),
  max_runtime_seconds integer not null default 300 check (max_runtime_seconds > 0),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 10),
  batch_size integer check (batch_size is null or batch_size between 1 and 5000),
  run_order smallint not null default 100,
  scope jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, domain)
);

create index if not exists sync_policies_org_enabled_idx
  on integration.sync_policies (organization_id, enabled, run_order);

create table if not exists integration.sync_domain_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete cascade,
  domain text not null,
  last_run_id uuid references integration.sync_runs(id) on delete set null,
  health_status text not null default 'unknown'
    check (health_status in ('unknown','running','healthy','degraded','stuck','broken')),
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  next_due_at timestamptz,
  freshness_observed_at timestamptz,
  records_processed bigint not null default 0 check (records_processed >= 0),
  records_changed bigint not null default 0 check (records_changed >= 0),
  conflicts bigint not null default 0 check (conflicts >= 0),
  api_calls integer not null default 0 check (api_calls >= 0),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (source_id, domain)
);

create index if not exists sync_domain_state_org_health_idx
  on integration.sync_domain_state (organization_id, health_status, updated_at desc);

create index if not exists sync_domain_state_due_idx
  on integration.sync_domain_state (next_due_at)
  where health_status <> 'broken';

create table if not exists integration.sync_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete cascade,
  domain text not null,
  fingerprint text not null,
  category text not null,
  severity text not null default 'warning'
    check (severity in ('info','warning','error','critical')),
  status text not null default 'open'
    check (status in ('open','resolved','ignored')),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  last_run_id uuid references integration.sync_runs(id) on delete set null,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sync_incidents_one_open_fingerprint_idx
  on integration.sync_incidents (source_id, domain, fingerprint)
  where status = 'open';

create index if not exists sync_incidents_org_open_idx
  on integration.sync_incidents (organization_id, severity, last_seen_at desc)
  where status = 'open';

alter table integration.sync_policies enable row level security;
alter table integration.sync_domain_state enable row level security;
alter table integration.sync_incidents enable row level security;

revoke all on integration.sync_policies from public, anon, authenticated;
revoke all on integration.sync_domain_state from public, anon, authenticated;
revoke all on integration.sync_incidents from public, anon, authenticated;

grant select, insert, update, delete on integration.sync_policies to service_role;
grant select, insert, update, delete on integration.sync_domain_state to service_role;
grant select, insert, update, delete on integration.sync_incidents to service_role;

insert into integration.sync_policies (
  organization_id, source_id, domain, schedule_cron, schedule_timezone,
  freshness_sla_minutes, max_runtime_seconds, max_attempts, batch_size, run_order, scope
)
select
  s.organization_id,
  s.id,
  v.domain,
  v.schedule_cron,
  'UTC',
  v.freshness_sla_minutes,
  v.max_runtime_seconds,
  3,
  v.batch_size,
  v.run_order,
  v.scope
from integration.external_sources s
cross join (
  values
    ('products', '0 */6 * * *', 480, 240, 100, 10, '{"poll":"newest_500","read_only":true}'::jsonb),
    ('stock', '10 */6 * * *', 480, 300, 500, 20, '{"warehouse_external_ids":["001","002","003","004"],"physical_only":true,"read_only":true}'::jsonb),
    ('financial_masters', '20 4 * * *', 1560, 300, 500, 30, '{"read_only":true}'::jsonb)
) as v(domain, schedule_cron, freshness_sla_minutes, max_runtime_seconds, batch_size, run_order, scope)
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

insert into integration.sync_domain_state (
  organization_id, source_id, domain, health_status, last_run_id,
  last_started_at, last_success_at, freshness_observed_at,
  records_processed, records_changed, conflicts, updated_at
)
select
  p.organization_id,
  p.source_id,
  p.domain,
  case when r.status='completed' then 'healthy'
       when r.status='failed' then 'degraded'
       when r.status='running' then 'running'
       else 'unknown' end,
  r.id,
  r.started_at,
  case when r.status='completed' then r.finished_at else null end,
  case when p.domain='stock' then (
    select max(st.synced_at)
    from integration.laudus_product_stock st
    where st.organization_id=p.organization_id
      and st.warehouse_external_id in ('001','002','003','004')
  ) when p.domain='products' then (
    select max(lp.synced_at)
    from integration.laudus_products lp
    where lp.organization_id=p.organization_id
  ) else r.finished_at end,
  coalesce((r.counters->>'processed')::bigint,0),
  coalesce((r.counters->>'changed')::bigint,0),
  coalesce((r.counters->>'conflict')::bigint,0),
  now()
from integration.sync_policies p
left join lateral (
  select sr.*
  from integration.sync_runs sr
  where sr.organization_id=p.organization_id
    and sr.source_id=p.source_id
    and (
      (p.domain='products' and sr.checkpoint->>'entity_type'='product')
      or (p.domain='stock' and sr.checkpoint->>'entity_type'='stock')
      or (p.domain='financial_masters' and sr.checkpoint->>'entity_type'='financial_masters')
    )
  order by sr.created_at desc
  limit 1
) r on true
on conflict (source_id, domain) do update set
  health_status=excluded.health_status,
  last_run_id=excluded.last_run_id,
  last_started_at=excluded.last_started_at,
  last_success_at=excluded.last_success_at,
  freshness_observed_at=excluded.freshness_observed_at,
  records_processed=excluded.records_processed,
  records_changed=excluded.records_changed,
  conflicts=excluded.conflicts,
  updated_at=now();

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
  coalesce(st.health_status,'unknown') as health_status,
  st.last_run_id,
  st.last_started_at,
  st.last_success_at,
  st.last_failure_at,
  st.next_due_at,
  st.freshness_observed_at,
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

comment on table integration.sync_policies is
  'Private per-source synchronization policy: schedule, freshness SLA, retry/batch limits and domain scope.';
comment on table integration.sync_domain_state is
  'Private materialized current synchronization health by source and domain; sync_runs remains canonical run history.';
comment on table integration.sync_incidents is
  'Private operational sync incidents. Data mismatches remain in reconciliation_items.';
comment on view public.laudus_sync_health_service_v1 is
  'Server-only health projection for Laudus synchronization domains.';
