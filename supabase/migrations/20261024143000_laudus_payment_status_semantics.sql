-- Clarify Laudus purchase-invoice payment semantics.
-- Negative documents are financial adjustments/credits, not unpaid invoices.
-- Raw allocation evidence is preserved; this view only derives a safe read model.

create or replace view integration.laudus_purchase_invoice_payment_status_v1 as
select
  i.organization_id,
  i.external_id as purchase_invoice_external_id,
  i.laudus_purchase_invoice_id,
  i.doc_number,
  i.supplier_external_id,
  i.supplier_name,
  i.issued_date,
  i.due_date,
  i.total_amount,
  i.currency,
  coalesce(sum(a.applied_amount),0)::numeric as paid_amount,
  case
    when i.total_amount <= 0 then 0::numeric
    else greatest(i.total_amount-coalesce(sum(a.applied_amount),0),0)::numeric
  end as outstanding_amount,
  count(distinct a.payment_external_id)::bigint as payment_count,
  max(p.issued_date) as last_payment_at,
  bool_or(coalesce(p.deposited,false)) as any_deposited,
  case
    when i.total_amount < 0 then 'credit_adjustment'
    when i.total_amount = 0 then 'zero_value'
    when coalesce(sum(a.applied_amount),0) <= 0 then 'unpaid'
    when coalesce(sum(a.applied_amount),0) + 0.005 >= i.total_amount then 'paid'
    else 'partially_paid'
  end as payment_status
from integration.laudus_purchase_invoices i
left join integration.laudus_purchase_payment_allocations a
  on a.organization_id=i.organization_id
 and a.purchase_invoice_external_id=i.external_id
left join integration.laudus_purchase_payments p
  on p.organization_id=a.organization_id
 and p.external_id=a.payment_external_id
group by i.organization_id,i.external_id,i.laudus_purchase_invoice_id,i.doc_number,
         i.supplier_external_id,i.supplier_name,i.issued_date,i.due_date,i.total_amount,i.currency;

revoke all on integration.laudus_purchase_invoice_payment_status_v1 from public, anon, authenticated;
grant select on integration.laudus_purchase_invoice_payment_status_v1 to service_role;

comment on view integration.laudus_purchase_invoice_payment_status_v1 is
  'Read-only Laudus invoice payment status. Negative documents are classified as credit_adjustment and never contribute payable outstanding. Raw Laudus allocations remain unchanged.';
