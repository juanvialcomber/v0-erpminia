-- Classify Laudus/MOTIL stock mismatches by evidence freshness.
-- A stale MOTIL balance is not treated as a confirmed stock conflict.

create or replace view public.laudus_inventory_freshness_summary_service_v1
with (security_invoker=true) as
select
  organization_id,
  count(*) filter (
    where reconciliation_state='quantity_mismatch'
  ) as quantity_mismatches,
  count(*) filter (
    where reconciliation_state='quantity_mismatch'
      and motil_updated_at is not null
      and laudus_synced_at is not null
      and motil_updated_at >= (laudus_synced_at at time zone 'UTC') - interval '1 day'
  ) as fresh_mismatches_1d,
  count(*) filter (
    where reconciliation_state='quantity_mismatch'
      and (
        motil_updated_at is null
        or laudus_synced_at is null
        or motil_updated_at < (laudus_synced_at at time zone 'UTC') - interval '7 days'
      )
  ) as stale_mismatches_7d,
  count(*) filter (
    where reconciliation_state='quantity_mismatch'
      and motil_updated_at is not null
      and laudus_synced_at is not null
      and motil_updated_at < (laudus_synced_at at time zone 'UTC') - interval '30 days'
  ) as stale_mismatches_30d,
  max(laudus_synced_at) as latest_laudus_stock_sync,
  max(motil_updated_at) as latest_motil_stock_update
from public.laudus_inventory_reconciliation_service_v1
group by organization_id;

revoke all on public.laudus_inventory_freshness_summary_service_v1 from public,anon,authenticated;
grant select on public.laudus_inventory_freshness_summary_service_v1 to service_role;

comment on view public.laudus_inventory_freshness_summary_service_v1
is 'Separates fresh stock conflicts from stale MOTIL comparison evidence; never mutates inventory.';
