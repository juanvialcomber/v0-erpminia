-- Resolve Laudus traceFrom identifiers against staged purchase documents without guessing step semantics.
-- Exact ID matches only; ambiguous/unresolved links remain explicit.

create or replace view integration.laudus_purchase_invoice_trace_resolution_v1 as
select
  t.organization_id,
  t.invoice_external_id,
  t.laudus_purchase_invoice_id,
  t.invoice_item_id,
  t.trace_id,
  t.from_step,
  t.from_id,
  po.external_id as purchase_order_external_id,
  po.laudus_purchase_order_id,
  po.order_number as purchase_order_number,
  wb.external_id as waybill_external_id,
  wb.laudus_purchase_waybill_id,
  wb.doc_number as waybill_number,
  case
    when po.external_id is not null and wb.external_id is null then 'exact_purchase_order'
    when po.external_id is null and wb.external_id is not null then 'exact_waybill'
    when po.external_id is not null and wb.external_id is not null then 'ambiguous_id'
    else 'unresolved'
  end as resolution_status
from integration.laudus_purchase_invoice_item_traces t
left join integration.laudus_purchase_orders po
  on po.organization_id = t.organization_id
 and po.laudus_purchase_order_id = t.from_id
left join integration.laudus_waybills wb
  on wb.organization_id = t.organization_id
 and wb.laudus_purchase_waybill_id = t.from_id;

comment on view integration.laudus_purchase_invoice_trace_resolution_v1 is
  'Exact resolution of Laudus PurchaseInvoiceItemDto.traceFrom IDs against staged purchase orders and waybills. fromStep is preserved as source evidence; no undocumented step-code semantics are assumed.';

create or replace function public.motil_laudus_invoice_trace_coverage(
  p_organization_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, integration, pg_temp
as $$
  select jsonb_build_object(
    'invoices_total', (
      select count(*)
      from integration.laudus_purchase_invoices
      where organization_id = p_organization_id
    ),
    'invoices_scanned', (
      select count(*)
      from integration.laudus_purchase_invoice_trace_sync
      where organization_id = p_organization_id
        and status = 'complete'
    ),
    'trace_rows', (
      select count(*)
      from integration.laudus_purchase_invoice_item_traces
      where organization_id = p_organization_id
    ),
    'exact_purchase_order', (
      select count(*)
      from integration.laudus_purchase_invoice_trace_resolution_v1
      where organization_id = p_organization_id
        and resolution_status = 'exact_purchase_order'
    ),
    'exact_waybill', (
      select count(*)
      from integration.laudus_purchase_invoice_trace_resolution_v1
      where organization_id = p_organization_id
        and resolution_status = 'exact_waybill'
    ),
    'ambiguous', (
      select count(*)
      from integration.laudus_purchase_invoice_trace_resolution_v1
      where organization_id = p_organization_id
        and resolution_status = 'ambiguous_id'
    ),
    'unresolved', (
      select count(*)
      from integration.laudus_purchase_invoice_trace_resolution_v1
      where organization_id = p_organization_id
        and resolution_status = 'unresolved'
    ),
    'canonical_mutated', false,
    'laudus_mutated', false
  );
$$;

revoke all on function public.motil_laudus_invoice_trace_coverage(uuid) from public;
grant execute on function public.motil_laudus_invoice_trace_coverage(uuid) to service_role;
