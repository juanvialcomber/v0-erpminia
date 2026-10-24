-- Rehydrate Laudus purchase invoice monetary totals from monthly purchase ledger.
-- Staging only. Does not touch MOTIL supplier invoices, payables or payments.

create or replace function public.motil_rehydrate_laudus_invoice_totals(
  p_organization_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, pg_temp
as $function$
declare
  v_row jsonb;
  v_external_id text;
  v_updated integer := 0;
  v_missing integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'batch too large';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_external_id := nullif(trim(coalesce(
      v_row->>'purchaseInvoiceId',
      v_row->>'invoiceId'
    )), '');

    if v_external_id is null then
      continue;
    end if;

    update integration.laudus_purchase_invoices
    set
      net_amount = nullif(coalesce(
        v_row#>>'{totals,net}',
        v_row->>'totals_net',
        v_row->>'netAmount'
      ), '')::numeric,
      tax_amount = nullif(coalesce(
        v_row#>>'{totals,VAT}',
        v_row->>'totals_VAT',
        v_row->>'taxAmount'
      ), '')::numeric,
      total_amount = nullif(coalesce(
        v_row#>>'{totals,total}',
        v_row->>'totals_total',
        v_row->>'totalAmount'
      ), '')::numeric,
      currency = nullif(trim(coalesce(
        v_row#>>'{totals,currencyCode}',
        v_row->>'totals_currencyCode',
        v_row#>>'{totalsOriginalCurrency,currencyCode}',
        v_row->>'currency'
      )), ''),
      source_payload = jsonb_set(
        coalesce(source_payload,'{}'::jsonb),
        '{ledger}',
        v_row,
        true
      ),
      payload_hash = md5(
        coalesce(source_payload,'{}'::jsonb)::text || '|' || v_row::text
      ),
      synced_at = now()
    where organization_id = p_organization_id
      and external_id = v_external_id;

    if found then
      v_updated := v_updated + 1;
    else
      v_missing := v_missing + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'updated', v_updated,
    'missing_staged_invoice', v_missing,
    'canonical_mutated', false,
    'laudus_mutated', false
  );
end;
$function$;

revoke all on function public.motil_rehydrate_laudus_invoice_totals(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.motil_rehydrate_laudus_invoice_totals(uuid,jsonb)
  to service_role;
