-- Laudus pending DTE domain policy.
-- Read-only source snapshot. This domain captures documents while Laudus exposes them as pending;
-- it must not be interpreted as a complete historical DTE ledger.

insert into integration.sync_policies (
  id,
  organization_id,
  source_id,
  domain,
  enabled,
  schedule_cron,
  schedule_timezone,
  freshness_sla_minutes,
  max_runtime_seconds,
  max_attempts,
  batch_size,
  run_order,
  scope,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  s.organization_id,
  s.id,
  'dtes',
  true,
  '20 5 * * *',
  'UTC',
  1560,
  120,
  3,
  100,
  85,
  jsonb_build_object(
    'mode', 'pending_snapshot',
    'endpoint', '/DTE/pending',
    'read_only', true,
    'historical_complete', false,
    'executed_in', 'laudus-core-daily'
  ),
  now(),
  now()
from integration.external_sources s
where s.source_key='laudus'
  and s.enabled=true
on conflict (source_id, domain)
do update set
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
