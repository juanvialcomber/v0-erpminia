-- Procurement receipt coverage separates legacy imported purchase orders from
-- MOTIL-native orders. Legacy status=received is not physical receipt evidence.

create or replace view public.procurement_receipt_coverage_v1
with (security_invoker = true)
as
with line_rollup as (
  select
    pol.organization_id,
    pol.purchase_order_id,
    count(*) as line_count,
    sum(coalesce(pol.quantity,0)) as ordered_qty,
    sum(coalesce(pol.quantity_received,0)) as received_qty,
    sum(greatest(coalesce(pol.quantity,0)-coalesce(pol.quantity_received,0),0)) as pending_qty
  from canonical.purchase_order_lines pol
  group by pol.organization_id,pol.purchase_order_id
),
receipt_rollup as (
  select
    gr.organization_id,
    gr.purchase_order_id,
    count(*) as receipt_count,
    max(gr.received_at) as last_received_at
  from canonical.goods_receipts gr
  group by gr.organization_id,gr.purchase_order_id
)
select
  po.organization_id,
  po.id as purchase_order_id,
  po.order_number,
  po.order_date,
  po.supplier_name,
  po.total_amount,
  po.currency,
  po.procurement_request_id,
  po.source_file,
  po.source_sheet,
  case
    when po.procurement_request_id is not null then 'motil_native'
    when po.source_file='public.purchase_orders' then 'legacy_import'
    else 'external_other'
  end as order_origin,
  coalesce(lr.line_count,0) as line_count,
  coalesce(lr.ordered_qty,0) as ordered_qty,
  coalesce(lr.received_qty,0) as received_qty,
  coalesce(lr.pending_qty,0) as pending_qty,
  coalesce(rr.receipt_count,0) as receipt_count,
  rr.last_received_at,
  case
    when po.procurement_request_id is null then 'historical_evidence'
    when coalesce(lr.pending_qty,0)>0 then 'pending_receipt'
    when coalesce(rr.receipt_count,0)>0 or coalesce(lr.received_qty,0)>0 then 'received'
    else 'no_receipt_required_or_empty'
  end as receipt_state,
  case
    when po.procurement_request_id is not null and coalesce(lr.pending_qty,0)>0 then true
    else false
  end as human_action_now
from canonical.purchase_orders po
left join line_rollup lr
  on lr.organization_id=po.organization_id and lr.purchase_order_id=po.id
left join receipt_rollup rr
  on rr.organization_id=po.organization_id and rr.purchase_order_id=po.id;

revoke all on public.procurement_receipt_coverage_v1 from public, anon, authenticated;
grant select on public.procurement_receipt_coverage_v1 to service_role;
