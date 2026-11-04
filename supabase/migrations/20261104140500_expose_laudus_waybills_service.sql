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


create or replace view public.laudus_waybill_recovery_summary_v1
with (security_invoker=true) as
select
  w.organization_id,
  count(*)::bigint as waybills_total,
  count(*) filter (
    where w.supplier_name is null and w.supplier_tax_id is null
  )::bigint as missing_supplier,
  count(*) filter (
    where w.warehouse_name is null and w.warehouse_external_id is null
  )::bigint as missing_warehouse,
  count(*) filter (
    where not exists (
      select 1
      from integration.laudus_waybill_lines l
      where l.organization_id=w.organization_id
        and l.waybill_external_id=w.external_id
    )
  )::bigint as missing_lines,
  count(*) filter (
    where w.issued_date > now() + interval '1 day'
  )::bigint as future_dates,
  max(w.synced_at) as latest_sync_at
from integration.laudus_waybills w
group by w.organization_id;

revoke all on public.laudus_waybill_recovery_summary_v1 from public,anon,authenticated;
grant select on public.laudus_waybill_recovery_summary_v1 to service_role;

comment on view public.laudus_waybill_recovery_summary_v1 is
  'Read-only recovery coverage for Laudus waybill evidence. Missing metadata/lines remain explicit until source evidence is re-ingested.';
