-- Align Laudus payment staging with the real flattened /purchases/payments/list shape.
-- Source evidence only; never writes MOTIL operational payables/payments.

create or replace function public.motil_ingest_laudus_purchase_payments(
  p_organization_id uuid,
  p_payments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, pg_temp
as $function$
declare
  v_source_id uuid;
  v_row jsonb;
  v_payment_id text;
  v_item_id text;
  v_payments_seen integer := 0;
  v_allocations integer := 0;
begin
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'p_payments must be a JSON array';
  end if;
  if jsonb_array_length(p_payments) > 30000 then
    raise exception 'batch too large';
  end if;

  select id into v_source_id
  from integration.external_sources
  where organization_id = p_organization_id
    and source_key = 'laudus'
  limit 1;

  if v_source_id is null then
    raise exception 'Laudus external source is not configured';
  end if;

  for v_row in select value from jsonb_array_elements(p_payments)
  loop
    v_payment_id := nullif(trim(v_row->>'paymentId'), '');
    if v_payment_id is null then
      continue;
    end if;

    insert into integration.laudus_purchase_payments(
      organization_id,source_id,external_id,laudus_payment_id,issued_date,due_date,
      document,deposited,payment_type,bank,account_other,journal_entry_issued,
      journal_entry_deposited,notes,payload_hash,source_payload,synced_at
    )
    values(
      p_organization_id,v_source_id,v_payment_id,
      case when v_payment_id ~ '^[0-9]+$' then v_payment_id::bigint else 0 end,
      nullif(v_row->>'issuedDate','')::timestamptz,
      nullif(v_row->>'dueDate','')::timestamptz,
      nullif(v_row->>'document',''),
      case when v_row ? 'deposited' and nullif(v_row->>'deposited','') is not null
        then (v_row->>'deposited')::boolean else null end,
      jsonb_strip_nulls(jsonb_build_object(
        'code', nullif(v_row->>'paymentType_code',''),
        'description', nullif(v_row->>'paymentType_description','')
      )),
      jsonb_strip_nulls(jsonb_build_object(
        'bankId', nullif(v_row->>'bank_bankId',''),
        'name', nullif(v_row->>'bank_name','')
      )),
      'null'::jsonb,
      'null'::jsonb,
      'null'::jsonb,
      nullif(v_row->>'notes',''),
      md5(v_row::text),
      v_row,
      now()
    )
    on conflict (organization_id,source_id,external_id) do update set
      issued_date=excluded.issued_date,
      due_date=excluded.due_date,
      document=excluded.document,
      deposited=excluded.deposited,
      payment_type=excluded.payment_type,
      bank=excluded.bank,
      notes=excluded.notes,
      payload_hash=excluded.payload_hash,
      source_payload=excluded.source_payload,
      synced_at=now();

    v_payments_seen := v_payments_seen + 1;

    v_item_id := nullif(trim(v_row->>'purchaseInvoices_itemId'), '');
    if v_item_id is null then
      continue;
    end if;

    insert into integration.laudus_purchase_payment_allocations(
      organization_id,source_id,payment_external_id,payment_item_id,
      purchase_invoice_external_id,doc_number,supplier_external_id,supplier_name,
      original_amount,currency_code,parity_to_main_currency,applied_amount,
      cost_center_external_id,source_payload,synced_at
    )
    values(
      p_organization_id,v_source_id,v_payment_id,v_item_id,
      nullif(trim(v_row->>'purchaseInvoices_purchaseInvoiceId'),''),
      nullif(trim(v_row->>'purchaseInvoices_docNumber'),''),
      nullif(trim(v_row->>'purchaseInvoices_supplier_supplierId'),''),
      nullif(trim(v_row->>'purchaseInvoices_supplier_name'),''),
      nullif(v_row->>'purchaseInvoices_originalAmount','')::numeric,
      nullif(trim(v_row->>'purchaseInvoices_currencyCode'),''),
      nullif(v_row->>'purchaseInvoices_parityToMainCurrency','')::numeric,
      nullif(v_row->>'purchaseInvoices_amount','')::numeric,
      nullif(trim(v_row->>'purchaseInvoices_costCenter_costCenterId'),''),
      v_row,
      now()
    )
    on conflict (organization_id,source_id,payment_external_id,payment_item_id) do update set
      purchase_invoice_external_id=excluded.purchase_invoice_external_id,
      doc_number=excluded.doc_number,
      supplier_external_id=excluded.supplier_external_id,
      supplier_name=excluded.supplier_name,
      original_amount=excluded.original_amount,
      currency_code=excluded.currency_code,
      parity_to_main_currency=excluded.parity_to_main_currency,
      applied_amount=excluded.applied_amount,
      cost_center_external_id=excluded.cost_center_external_id,
      source_payload=excluded.source_payload,
      synced_at=now();

    v_allocations := v_allocations + 1;
  end loop;

  return jsonb_build_object(
    'rows_seen', v_payments_seen,
    'distinct_payments', (
      select count(distinct external_id)
      from integration.laudus_purchase_payments
      where organization_id=p_organization_id and source_id=v_source_id
    ),
    'allocations', v_allocations,
    'canonical_mutated', false,
    'laudus_mutated', false
  );
end;
$function$;

revoke all on function public.motil_ingest_laudus_purchase_payments(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.motil_ingest_laudus_purchase_payments(uuid,jsonb)
  to service_role;
