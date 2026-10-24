-- Ingest read-only Laudus accounting, bank-statement and DTE evidence.
-- Integration-only; no canonical/public financial authority is changed.

create or replace function public.motil_ingest_laudus_extended_finance(
  p_organization_id uuid,
  p_accounting_entries jsonb default '[]'::jsonb,
  p_bank_statements jsonb default '[]'::jsonb,
  p_dtes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public,integration,pg_temp
as $function$
declare
  v_source_id uuid;
  v_entries integer := 0;
  v_statements integer := 0;
  v_dtes integer := 0;
begin
  select id into v_source_id
  from integration.external_sources
  where organization_id=p_organization_id
    and source_key='laudus'
    and enabled=true
  limit 1;

  if v_source_id is null then
    raise exception 'Enabled Laudus source not found for organization';
  end if;

  insert into integration.laudus_accounting_entries(
    organization_id,source_id,external_id,entry_number,entry_date,journal_code,entry_type,
    description,cost_center_external_id,debit_total,credit_total,currency_code,
    source_updated_at,payload_hash,source_payload,observed_at,synced_at
  )
  select
    p_organization_id,
    v_source_id,
    (x->>'journalEntryId'),
    nullif(x->>'journalEntryNumber',''),
    nullif(x->>'date','')::timestamptz,
    nullif(x->>'bookId',''),
    nullif(x->>'type',''),
    nullif(x->>'notes',''),
    null,
    case when jsonb_typeof(x->'lines')='array'
      then (select coalesce(sum(coalesce((line->>'debit')::numeric,0)),0) from jsonb_array_elements(x->'lines') line)
      else null end,
    case when jsonb_typeof(x->'lines')='array'
      then (select coalesce(sum(coalesce((line->>'credit')::numeric,0)),0) from jsonb_array_elements(x->'lines') line)
      else null end,
    null,
    coalesce(nullif(x->>'modifiedAt','')::timestamptz,nullif(x->>'createdAt','')::timestamptz,nullif(x->>'date','')::timestamptz),
    md5(x::text),
    x,
    now(),
    now()
  from jsonb_array_elements(coalesce(p_accounting_entries,'[]'::jsonb)) x
  where nullif(x->>'journalEntryId','') is not null
  on conflict (organization_id,source_id,external_id) do update set
    entry_number=excluded.entry_number,
    entry_date=excluded.entry_date,
    journal_code=excluded.journal_code,
    entry_type=excluded.entry_type,
    description=excluded.description,
    debit_total=excluded.debit_total,
    credit_total=excluded.credit_total,
    source_updated_at=excluded.source_updated_at,
    payload_hash=excluded.payload_hash,
    source_payload=excluded.source_payload,
    observed_at=excluded.observed_at,
    synced_at=excluded.synced_at;
  get diagnostics v_entries = row_count;

  insert into integration.laudus_bank_statements(
    organization_id,source_id,external_id,bank_external_id,bank_account_external_id,
    statement_number,date_from,date_to,opening_balance,closing_balance,currency_code,
    source_updated_at,payload_hash,source_payload,observed_at,synced_at
  )
  select
    p_organization_id,
    v_source_id,
    (x->>'bankStatementId'),
    coalesce(x#>>'{bank,bankId}',x->>'bankId'),
    null,
    nullif(x->>'number',''),
    nullif(x->>'dateFrom','')::timestamptz,
    nullif(x->>'dateTo','')::timestamptz,
    case when nullif(x->>'initialBalance','') is not null then (x->>'initialBalance')::numeric else null end,
    case when jsonb_typeof(x->'lines')='array'
      then coalesce((x->>'initialBalance')::numeric,0)
        + (select coalesce(sum(coalesce((line->>'deposit')::numeric,0)-coalesce((line->>'withdrawal')::numeric,0)),0)
           from jsonb_array_elements(x->'lines') line)
      else null end,
    null,
    coalesce(nullif(x->>'modifiedAt','')::timestamptz,nullif(x->>'createdAt','')::timestamptz,nullif(x->>'dateTo','')::timestamptz),
    md5(x::text),
    x,
    now(),
    now()
  from jsonb_array_elements(coalesce(p_bank_statements,'[]'::jsonb)) x
  where nullif(x->>'bankStatementId','') is not null
  on conflict (organization_id,source_id,external_id) do update set
    bank_external_id=excluded.bank_external_id,
    statement_number=excluded.statement_number,
    date_from=excluded.date_from,
    date_to=excluded.date_to,
    opening_balance=excluded.opening_balance,
    closing_balance=excluded.closing_balance,
    source_updated_at=excluded.source_updated_at,
    payload_hash=excluded.payload_hash,
    source_payload=excluded.source_payload,
    observed_at=excluded.observed_at,
    synced_at=excluded.synced_at;
  get diagnostics v_statements = row_count;

  insert into integration.laudus_dtes(
    organization_id,source_id,external_id,document_type,folio,issuer_tax_id,receiver_tax_id,
    issued_date,net_amount,tax_amount,total_amount,currency_code,status,source_updated_at,
    payload_hash,source_payload,observed_at,synced_at
  )
  select
    p_organization_id,
    v_source_id,
    concat(coalesce(x->>'docTypeId','?'),':',coalesce(x->>'docNumber','?')),
    coalesce(nullif(x->>'docTypeName',''),nullif(x->>'docTypeId','')),
    nullif(x->>'docNumber',''),
    null,
    nullif(x->>'customerVATId',''),
    nullif(x->>'issuedDate','')::timestamptz,
    null,
    null,
    case when nullif(x->>'total','') is not null then (x->>'total')::numeric else null end,
    null,
    nullif(x->>'documentStatus',''),
    nullif(x->>'issuedDate','')::timestamptz,
    md5(x::text),
    x,
    now(),
    now()
  from jsonb_array_elements(coalesce(p_dtes,'[]'::jsonb)) x
  where nullif(x->>'docTypeId','') is not null
    and nullif(x->>'docNumber','') is not null
  on conflict (organization_id,source_id,external_id) do update set
    document_type=excluded.document_type,
    folio=excluded.folio,
    receiver_tax_id=excluded.receiver_tax_id,
    issued_date=excluded.issued_date,
    total_amount=excluded.total_amount,
    status=excluded.status,
    source_updated_at=excluded.source_updated_at,
    payload_hash=excluded.payload_hash,
    source_payload=excluded.source_payload,
    observed_at=excluded.observed_at,
    synced_at=excluded.synced_at;
  get diagnostics v_dtes = row_count;

  return jsonb_build_object(
    'accounting_entries_upserted',v_entries,
    'bank_statements_upserted',v_statements,
    'dtes_upserted',v_dtes,
    'canonical_mutated',false,
    'laudus_mutated',false
  );
end;
$function$;

revoke all on function public.motil_ingest_laudus_extended_finance(uuid,jsonb,jsonb,jsonb)
from public,anon,authenticated;
grant execute on function public.motil_ingest_laudus_extended_finance(uuid,jsonb,jsonb,jsonb)
to service_role;
