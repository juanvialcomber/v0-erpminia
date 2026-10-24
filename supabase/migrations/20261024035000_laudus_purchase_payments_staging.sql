-- Laudus purchase payments staging.
-- Financial source evidence only. Never mutates MOTIL procurement payables or canonical finance state.

create table if not exists integration.laudus_purchase_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete restrict,
  external_id text not null,
  laudus_payment_id bigint not null,
  issued_date timestamptz,
  due_date timestamptz,
  document text,
  deposited boolean,
  payment_type jsonb,
  bank jsonb,
  account_other jsonb,
  journal_entry_issued jsonb,
  journal_entry_deposited jsonb,
  notes text,
  payload_hash text not null,
  source_payload jsonb not null,
  synced_at timestamptz not null default now(),
  unique (organization_id, source_id, external_id)
);

create index if not exists laudus_purchase_payments_org_date_idx
  on integration.laudus_purchase_payments(organization_id, issued_date desc);

create table if not exists integration.laudus_purchase_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete restrict,
  payment_external_id text not null,
  payment_item_id text not null,
  purchase_invoice_external_id text,
  doc_number text,
  supplier_external_id text,
  supplier_name text,
  original_amount numeric,
  currency_code text,
  parity_to_main_currency numeric,
  applied_amount numeric,
  cost_center_external_id text,
  source_payload jsonb not null,
  synced_at timestamptz not null default now(),
  unique (organization_id, source_id, payment_external_id, payment_item_id)
);

create index if not exists laudus_payment_allocations_invoice_idx
  on integration.laudus_purchase_payment_allocations(organization_id, purchase_invoice_external_id);

revoke all on integration.laudus_purchase_payments from public, anon, authenticated;
revoke all on integration.laudus_purchase_payment_allocations from public, anon, authenticated;
grant select, insert, update, delete on integration.laudus_purchase_payments to service_role;
grant select, insert, update, delete on integration.laudus_purchase_payment_allocations to service_role;

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
  v_item jsonb;
  v_payment_id text;
  v_item_id text;
  v_payments integer := 0;
  v_allocations integer := 0;
begin
  select id into v_source_id
  from integration.external_sources
  where organization_id = p_organization_id
    and source_key = 'laudus'
  limit 1;

  if v_source_id is null then
    raise exception 'Laudus external source is not configured';
  end if;

  for v_row in select value from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb))
  loop
    v_payment_id := nullif(v_row->>'paymentId','');
    if v_payment_id is null then continue; end if;

    insert into integration.laudus_purchase_payments(
      organization_id,source_id,external_id,laudus_payment_id,issued_date,due_date,
      document,deposited,payment_type,bank,account_other,journal_entry_issued,
      journal_entry_deposited,notes,payload_hash,source_payload,synced_at
    )
    values(
      p_organization_id,v_source_id,v_payment_id,(v_payment_id)::bigint,
      nullif(v_row->>'issuedDate','')::timestamptz,
      nullif(v_row->>'dueDate','')::timestamptz,
      nullif(v_row->>'document',''),
      case when v_row ? 'deposited' then (v_row->>'deposited')::boolean else null end,
      coalesce(v_row->'paymentType','null'::jsonb),
      coalesce(v_row->'bank','null'::jsonb),
      coalesce(v_row->'accountOther','null'::jsonb),
      coalesce(v_row->'journalEntryIssued','null'::jsonb),
      coalesce(v_row->'journalEntryDeposited','null'::jsonb),
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
      account_other=excluded.account_other,
      journal_entry_issued=excluded.journal_entry_issued,
      journal_entry_deposited=excluded.journal_entry_deposited,
      notes=excluded.notes,
      payload_hash=excluded.payload_hash,
      source_payload=excluded.source_payload,
      synced_at=now();

    v_payments := v_payments + 1;

    delete from integration.laudus_purchase_payment_allocations
    where organization_id=p_organization_id
      and source_id=v_source_id
      and payment_external_id=v_payment_id;

    for v_item in
      select value
      from jsonb_array_elements(
        case
          when jsonb_typeof(v_row->'purchaseInvoices')='array' then v_row->'purchaseInvoices'
          else '[]'::jsonb
        end
      )
    loop
      v_item_id := coalesce(nullif(v_item->>'itemId',''), md5(v_item::text));

      insert into integration.laudus_purchase_payment_allocations(
        organization_id,source_id,payment_external_id,payment_item_id,
        purchase_invoice_external_id,doc_number,supplier_external_id,supplier_name,
        original_amount,currency_code,parity_to_main_currency,applied_amount,
        cost_center_external_id,source_payload,synced_at
      )
      values(
        p_organization_id,v_source_id,v_payment_id,v_item_id,
        nullif(v_item->>'purchaseInvoiceId',''),
        nullif(v_item->>'docNumber',''),
        nullif(v_item#>>'{supplier,supplierId}',''),
        nullif(v_item#>>'{supplier,name}',''),
        nullif(v_item->>'originalAmount','')::numeric,
        nullif(v_item->>'currencyCode',''),
        nullif(v_item->>'parityToMainCurrency','')::numeric,
        nullif(v_item->>'amount','')::numeric,
        nullif(v_item#>>'{costCenter,costCenterId}',''),
        v_item,
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
  end loop;

  return jsonb_build_object(
    'payments', v_payments,
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
  greatest(i.total_amount-coalesce(sum(a.applied_amount),0),0)::numeric as outstanding_amount,
  count(distinct a.payment_external_id)::bigint as payment_count,
  max(p.issued_date) as last_payment_at,
  bool_or(coalesce(p.deposited,false)) as any_deposited,
  case
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
  'Read-only Laudus invoice payment status. Financial source evidence only; does not mutate MOTIL payable or payment records.';
