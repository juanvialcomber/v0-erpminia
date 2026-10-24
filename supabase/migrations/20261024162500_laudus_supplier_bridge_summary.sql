-- Aggregate summary for the precomputed Laudus supplier bridge.
-- Keeps API reads bounded to one row per organization.

create or replace view public.laudus_supplier_bridge_summary_service_v1
with (security_invoker = true)
as
select
  organization_id,
  count(*) as total_names,
  count(*) filter (where resolution_status = 'tax_verified_exact') as verified_names,
  count(*) filter (where resolution_status = 'source_placeholder') as placeholder_names,
  count(*) filter (where resolution_status = 'unresolved') as unresolved_names,
  count(*) filter (where resolution_status = 'ambiguous') as ambiguous_names,
  coalesce(sum(purchase_order_count) filter (where resolution_status = 'tax_verified_exact'),0) as verified_orders,
  coalesce(sum(purchase_order_count) filter (where resolution_status = 'source_placeholder'),0) as placeholder_orders,
  max(evaluated_at) as evaluated_at
from integration.laudus_supplier_bridge_candidates_v1
group by organization_id;

revoke all on public.laudus_supplier_bridge_summary_service_v1 from public,anon,authenticated;
grant select on public.laudus_supplier_bridge_summary_service_v1 to service_role;
