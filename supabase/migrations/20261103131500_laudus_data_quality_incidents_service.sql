-- Server-only projection of open Laudus data-quality incidents for authenticated MOTIL APIs.
-- Preserves source evidence and exposes aggregate counts only.

create or replace view public.laudus_data_quality_incidents_service_v1
with (security_invoker = true)
as
select
  i.organization_id,
  i.domain,
  coalesce(i.details->>'quality_rule', i.category) as quality_rule,
  count(*)::bigint as open_incidents,
  count(*) filter (where i.severity = 'critical')::bigint as critical_incidents,
  count(*) filter (where i.severity = 'error')::bigint as error_incidents,
  count(*) filter (where i.severity = 'warning')::bigint as warning_incidents,
  count(*) filter (where i.severity = 'info')::bigint as info_incidents,
  min(i.first_seen_at) as first_seen_at,
  max(i.last_seen_at) as last_seen_at
from integration.sync_incidents i
where i.status = 'open'
  and i.category = 'data_quality'
  and exists (
    select 1
    from integration.external_sources s
    where s.id = i.source_id
      and s.organization_id = i.organization_id
      and s.source_key = 'laudus'
  )
group by
  i.organization_id,
  i.domain,
  coalesce(i.details->>'quality_rule', i.category);

revoke all on public.laudus_data_quality_incidents_service_v1 from public, anon, authenticated;
grant select on public.laudus_data_quality_incidents_service_v1 to service_role;

comment on view public.laudus_data_quality_incidents_service_v1 is
  'Server-only aggregate of open Laudus source-quality incidents. Does not expose source payloads or mutate canonical data.';
