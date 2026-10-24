-- Populate normalized Laudus finance staging from already-ingested Laudus source evidence.
-- Idempotent and integration-only. No canonical/public financial mutation.

create or replace function public.motil_refresh_laudus_financial_staging(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public,integration,pg_temp
as $function$
declare
  v_payables integer := 0;
  v_credit_notes integer := 0;
begin
  insert into integration.laudus_accounts_payable (
    organization_id,
    source_id,
    external_id,
    supplier_external_id,
    purchase_invoice_external_id,
    document_number,
    issued_date,
    due_date,
    original_amount,
    outstanding_amount,
    currency_code,
    status,
    source_updated_at,
    payload_hash,
    source_payload,
    observed_at,
    synced_at
  )
  select
    pi.organization_id,
    pi.source_id,
    ps.purchase_invoice_external_id,
    ps.supplier_external_id,
    ps.purchase_invoice_external_id,
    ps.doc_number,
    ps.issued_date,
    ps.due_date,
    ps.total_amount,
    ps.outstanding_amount,
    ps.currency,
    ps.payment_status,
    pi.synced_at,
    md5(concat_ws('|',
      ps.purchase_invoice_external_id,
      coalesce(ps.total_amount::text,''),
      coalesce(ps.outstanding_amount::text,''),
      coalesce(ps.payment_status,''),
      coalesce(ps.last_payment_at::text,'')
    )),
    jsonb_build_object(
      'source','laudus_purchase_invoice_payment_status_v1',
      'purchaseInvoiceExternalId',ps.purchase_invoice_external_id,
      'docNumber',ps.doc_number,
      'supplierExternalId',ps.supplier_external_id,
      'supplierName',ps.supplier_name,
      'issuedDate',ps.issued_date,
      'dueDate',ps.due_date,
      'totalAmount',ps.total_amount,
      'paidAmount',ps.paid_amount,
      'outstandingAmount',ps.outstanding_amount,
      'paymentCount',ps.payment_count,
      'lastPaymentAt',ps.last_payment_at,
      'paymentStatus',ps.payment_status
    ),
    now(),
    now()
  from integration.laudus_purchase_invoice_payment_status_v1 ps
  join integration.laudus_purchase_invoices pi
    on pi.organization_id=ps.organization_id
   and pi.external_id=ps.purchase_invoice_external_id
  where ps.organization_id=p_organization_id
    and coalesce(ps.total_amount,0) > 0
  on conflict (organization_id,source_id,external_id) do update set
    supplier_external_id=excluded.supplier_external_id,
    purchase_invoice_external_id=excluded.purchase_invoice_external_id,
    document_number=excluded.document_number,
    issued_date=excluded.issued_date,
    due_date=excluded.due_date,
    original_amount=excluded.original_amount,
    outstanding_amount=excluded.outstanding_amount,
    currency_code=excluded.currency_code,
    status=excluded.status,
    source_updated_at=excluded.source_updated_at,
    payload_hash=excluded.payload_hash,
    source_payload=excluded.source_payload,
    observed_at=excluded.observed_at,
    synced_at=excluded.synced_at;
  get diagnostics v_payables = row_count;

  insert into integration.laudus_credit_notes (
    organization_id,
    source_id,
    external_id,
    supplier_external_id,
    purchase_invoice_external_id,
    document_number,
    issued_date,
    net_amount,
    tax_amount,
    total_amount,
    currency_code,
    status,
    source_updated_at,
    payload_hash,
    source_payload,
    observed_at,
    synced_at
  )
  select
    pi.organization_id,
    pi.source_id,
    pi.external_id,
    pi.supplier_external_id,
    pi.external_id,
    pi.doc_number,
    pi.issued_date,
    pi.net_amount,
    pi.tax_amount,
    pi.total_amount,
    pi.currency,
    'credit_adjustment',
    pi.synced_at,
    pi.payload_hash,
    pi.source_payload,
    now(),
    now()
  from integration.laudus_purchase_invoices pi
  where pi.organization_id=p_organization_id
    and coalesce(pi.total_amount,0) < 0
  on conflict (organization_id,source_id,external_id) do update set
    supplier_external_id=excluded.supplier_external_id,
    purchase_invoice_external_id=excluded.purchase_invoice_external_id,
    document_number=excluded.document_number,
    issued_date=excluded.issued_date,
    net_amount=excluded.net_amount,
    tax_amount=excluded.tax_amount,
    total_amount=excluded.total_amount,
    currency_code=excluded.currency_code,
    status=excluded.status,
    source_updated_at=excluded.source_updated_at,
    payload_hash=excluded.payload_hash,
    source_payload=excluded.source_payload,
    observed_at=excluded.observed_at,
    synced_at=excluded.synced_at;
  get diagnostics v_credit_notes = row_count;

  return jsonb_build_object(
    'accounts_payable_upserted',v_payables,
    'credit_notes_upserted',v_credit_notes,
    'canonical_mutated',false,
    'laudus_mutated',false
  );
end;
$function$;

revoke all on function public.motil_refresh_laudus_financial_staging(uuid)
from public,anon,authenticated;
grant execute on function public.motil_refresh_laudus_financial_staging(uuid)
to service_role;
