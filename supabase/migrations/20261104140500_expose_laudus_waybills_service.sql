create or replace view public.laudus_waybills_service_v1
with (security_invoker=true) as
select
  id,
  organization_id,
  external_id,
  laudus_purchase_waybill_id,
  doc_number,
  supplier_external_id,
  supplier_name,
  supplier_tax_id,
  warehouse_external_id,
  warehouse_name,
  issued_date,
  quality_flags,
  synced_at
from integration.laudus_waybills;

revoke all on public.laudus_waybills_service_v1 from public,anon,authenticated;
grant select on public.laudus_waybills_service_v1 to service_role;

comment on view public.laudus_waybills_service_v1 is
  'Read-only Laudus purchase waybill evidence for MOTIL reception reconciliation. A waybill is not automatically an accepted physical receipt.';
