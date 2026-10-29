-- MOTIL / Laudus inventory alignment
-- 1) Register the missing physical warehouse from Laudus without overwriting existing data.
-- 2) Expose a read-only operational stock projection that prefers current Laudus stock
--    while preserving MOTIL's historical quantity for reconciliation/audit.

insert into public.warehouses (
  organization_id,
  name,
  code,
  status
)
select
  o.id,
  'Bodega Central',
  '002',
  'active'
from public.organizations o
where o.slug = 'n3uralia'
on conflict (organization_id, code) do nothing;

create or replace view public.bodega_inventory_operational_service_v1
with (security_invoker = true)
as
select
  r.organization_id,
  r.canonical_product_id,
  r.product_external_id as laudus_product_external_id,
  r.sku,
  r.description,
  r.unit_of_measure,
  r.operational_category,
  r.laudus_stock as operational_quantity,
  r.motil_stock as legacy_motil_quantity,
  r.quantity_delta,
  r.reconciliation_state,
  r.source_date_to as laudus_stock_date,
  r.laudus_synced_at,
  r.motil_updated_at,
  case
    when r.reconciliation_state = 'aligned' then 'aligned'
    when r.reconciliation_state = 'quantity_mismatch'
         and (r.motil_updated_at is null or r.motil_updated_at < r.laudus_synced_at)
      then 'legacy_motil_stale'
    when r.reconciliation_state = 'missing_in_motil'
      then 'laudus_only_current'
    when r.reconciliation_state = 'laudus_only_zero'
      then 'laudus_zero_no_motil'
    else 'review'
  end as operational_resolution
from public.laudus_inventory_reconciliation_service_v1 r
where r.inventory_eligibility = 'eligible';

comment on view public.bodega_inventory_operational_service_v1 is
'Read-only Bodega operational stock projection. Laudus is the primary stock source; legacy MOTIL quantity remains visible only for reconciliation and audit.';
