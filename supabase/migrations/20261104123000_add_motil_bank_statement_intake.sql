-- MOTIL-owned bank statement intake.
-- This creates a canonical evidence layer independent of Laudus.
-- It does not reconcile payments automatically.

create table if not exists public.finance_bank_statement_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  source_name text not null,
  bank_account_label text not null,
  currency text not null default 'CLP',
  period_from date null,
  period_to date null,
  opening_balance numeric null,
  closing_balance numeric null,
  source_file_path text null,
  source_sha256 text not null,
  imported_by uuid null,
  imported_at timestamptz not null default now(),
  status text not null default 'imported'
    check (status in ('imported','review_required','ready','reconciled','rejected')),
  notes text null,
  unique (organization_id, source_sha256)
);

create table if not exists public.finance_bank_statement_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  statement_import_id uuid not null references public.finance_bank_statement_imports(id) on delete cascade,
  transaction_date date not null,
  description text not null,
  reference text null,
  amount numeric not null,
  currency text not null default 'CLP',
  running_balance numeric null,
  source_row integer null,
  source_hash text not null,
  reconciliation_status text not null default 'unmatched'
    check (reconciliation_status in ('unmatched','candidate','matched','ignored','review_required')),
  matched_payment_id uuid null references public.procurement_supplier_payments(id) on delete set null,
  match_notes text null,
  created_at timestamptz not null default now(),
  unique (organization_id, statement_import_id, source_hash)
);

create index if not exists finance_bank_statement_imports_org_period_idx
  on public.finance_bank_statement_imports(organization_id,period_to desc,imported_at desc);
create index if not exists finance_bank_statement_transactions_org_status_idx
  on public.finance_bank_statement_transactions(organization_id,reconciliation_status,transaction_date desc);
create index if not exists finance_bank_statement_transactions_statement_idx
  on public.finance_bank_statement_transactions(statement_import_id,transaction_date,source_row);

create or replace view public.finance_bank_statement_summary_v1
with (security_invoker=true) as
select
  i.organization_id,
  i.id as statement_import_id,
  i.source_name,
  i.bank_account_label,
  i.currency,
  i.period_from,
  i.period_to,
  i.opening_balance,
  i.closing_balance,
  i.status,
  i.imported_at,
  count(t.id)::bigint as transaction_count,
  count(t.id) filter (where t.reconciliation_status='matched')::bigint as matched_count,
  count(t.id) filter (where t.reconciliation_status in ('unmatched','candidate','review_required'))::bigint as open_count,
  coalesce(sum(t.amount),0)::numeric as net_movement
from public.finance_bank_statement_imports i
left join public.finance_bank_statement_transactions t
  on t.statement_import_id=i.id and t.organization_id=i.organization_id
group by i.id;

create or replace function public.import_finance_bank_statement_v1(
  p_organization_id uuid,
  p_source_name text,
  p_bank_account_label text,
  p_currency text,
  p_period_from date,
  p_period_to date,
  p_opening_balance numeric,
  p_closing_balance numeric,
  p_source_file_path text,
  p_source_sha256 text,
  p_transactions jsonb,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_id uuid;
  v_actor uuid;
  v_tx jsonb;
  v_row integer := 0;
  v_hash text;
begin
  if p_organization_id is null then raise exception 'Organización requerida'; end if;
  if nullif(trim(p_source_name),'') is null then raise exception 'Fuente bancaria requerida'; end if;
  if nullif(trim(p_bank_account_label),'') is null then raise exception 'Cuenta bancaria requerida'; end if;
  if nullif(trim(p_source_sha256),'') is null then raise exception 'Hash de fuente requerido'; end if;
  if p_transactions is null or jsonb_typeof(p_transactions) <> 'array' then
    raise exception 'Transacciones inválidas';
  end if;

  begin v_actor := auth.uid(); exception when others then v_actor := null; end;

  insert into public.finance_bank_statement_imports(
    organization_id,source_name,bank_account_label,currency,period_from,period_to,
    opening_balance,closing_balance,source_file_path,source_sha256,imported_by,notes
  ) values (
    p_organization_id,trim(p_source_name),trim(p_bank_account_label),coalesce(nullif(trim(p_currency),''),'CLP'),
    p_period_from,p_period_to,p_opening_balance,p_closing_balance,nullif(trim(p_source_file_path),''),
    trim(p_source_sha256),v_actor,nullif(trim(p_notes),'')
  )
  on conflict (organization_id,source_sha256) do update
    set notes=coalesce(excluded.notes,finance_bank_statement_imports.notes)
  returning id into v_id;

  for v_tx in select value from jsonb_array_elements(p_transactions)
  loop
    v_row := v_row + 1;
    if nullif(trim(v_tx->>'transaction_date'),'') is null
      or nullif(trim(v_tx->>'description'),'') is null
      or nullif(trim(v_tx->>'amount'),'') is null then
      raise exception 'Movimiento bancario incompleto en fila %', v_row;
    end if;

    v_hash := encode(
      digest(
        coalesce(v_tx->>'transaction_date','') || '|' ||
        coalesce(v_tx->>'description','') || '|' ||
        coalesce(v_tx->>'reference','') || '|' ||
        coalesce(v_tx->>'amount','') || '|' ||
        v_row::text,
        'sha256'
      ),
      'hex'
    );

    insert into public.finance_bank_statement_transactions(
      organization_id,statement_import_id,transaction_date,description,reference,amount,
      currency,running_balance,source_row,source_hash
    ) values (
      p_organization_id,v_id,(v_tx->>'transaction_date')::date,trim(v_tx->>'description'),
      nullif(trim(v_tx->>'reference'),''),
      (v_tx->>'amount')::numeric,
      coalesce(nullif(trim(v_tx->>'currency'),''),coalesce(nullif(trim(p_currency),''),'CLP')),
      nullif(trim(v_tx->>'running_balance'),'')::numeric,
      coalesce(nullif(v_tx->>'source_row','')::integer,v_row),
      v_hash
    )
    on conflict (organization_id,statement_import_id,source_hash) do nothing;
  end loop;

  return v_id;
end;
$$;

revoke all on public.finance_bank_statement_imports from public,anon,authenticated;
revoke all on public.finance_bank_statement_transactions from public,anon,authenticated;
revoke all on public.finance_bank_statement_summary_v1 from public,anon,authenticated;
revoke all on function public.import_finance_bank_statement_v1(uuid,text,text,text,date,date,numeric,numeric,text,text,jsonb,text) from public,anon,authenticated;

grant select on public.finance_bank_statement_imports,public.finance_bank_statement_transactions,public.finance_bank_statement_summary_v1 to service_role;
grant execute on function public.import_finance_bank_statement_v1(uuid,text,text,text,date,date,numeric,numeric,text,text,jsonb,text) to service_role;

comment on table public.finance_bank_statement_imports is
  'MOTIL-owned bank statement evidence. Independent from Laudus; import does not reconcile payments automatically.';
comment on table public.finance_bank_statement_transactions is
  'Bank statement transaction evidence for explicit reconciliation. No automatic payment match is authoritative.';
