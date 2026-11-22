-- Restore a previously referenced but undeployed Laudus inventory service view.
-- Read-only, tenant-scoped, and additive: no stock or movement rows are written.
-- Source observations are timestamps from Laudus; MOTIL warehouse_stock.updated_at
-- is a timestamp without zone in a UTC-configured legacy database.
-- A mismatch is recent only when both source and MOTIL evidence times exist.
-- 7-day/30-day stale counts are nested, not disjoint categories.

create or replace view public.laudus_inventory_freshness_summary_service_v1
with (security_invoker = true)
as
with compared as (
  select
    organization_id,
    reconciliation_state,
    laudus_synced_at,
    motil_updated_at,
    coalesce(source_date_to, laudus_synced_at) as source_observed_at,
    motil_updated_at at time zone 'UTC' as motil_observed_at
  from public.laudus_inventory_reconciliation_service_v1
)
select
  organization_id,
  count(*) filter (
    where reconciliation_state = 'quantity_mismatch'
  )::bigint as quantity_mismatches,
  count(*) filter (
    where reconciliation_state = 'quantity_mismatch'
      and source_observed_at is not null
      and motil_observed_at is not null
      and motil_observed_at >= source_observed_at - interval '1 day'
      and motil_observed_at <= source_observed_at + interval '1 day'
  )::bigint as fresh_mismatches_1d,
  count(*) filter (
    where reconciliation_state = 'quantity_mismatch'
      and source_observed_at is not null
      and motil_observed_at is not null
      and motil_observed_at < source_observed_at - interval '7 days'
  )::bigint as stale_mismatches_7d,
  count(*) filter (
    where reconciliation_state = 'quantity_mismatch'
      and source_observed_at is not null
      and motil_observed_at is not null
      and motil_observed_at < source_observed_at - interval '30 days'
  )::bigint as stale_mismatches_30d,
  max(laudus_synced_at) as latest_laudus_stock_sync,
  max(motil_updated_at) as latest_motil_stock_update
from compared
group by organization_id;

revoke all on public.laudus_inventory_freshness_summary_service_v1
  from public, anon, authenticated;
grant select on public.laudus_inventory_freshness_summary_service_v1
  to service_role;

comment on view public.laudus_inventory_freshness_summary_service_v1 is
  'Server-only evidence-age breakdown of Laudus vs MOTIL stock mismatches. 1d recent and >7d/>30d stale counts require both timestamps; source cutoff preferred to ingestion time, with no stock writes or automatic reconciliation.';
