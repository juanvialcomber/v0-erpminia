-- Complete Laudus normalized staging coverage for the entity types already declared by MOTIL.
-- Additive only. These tables are external evidence, not canonical financial authority.

create table if not exists integration.laudus_accounts_payable (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete restrict,
  external_id text not null,
  supplier_external_id text,
  purchase_invoice_external_id text,
  document_number text,
  issued_date timestamptz,
  due_date timestamptz,
  original_amount numeric,
  outstanding_amount numeric,
  currency_code text,
  status text,
  source_updated_at timestamptz,
  payload_hash text not null,
  source_payload jsonb not null,
  observed_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  unique (organization_id, source_id, external_id)
);

create table if not exists integration.laudus_credit_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete restrict,
  external_id text not null,
  supplier_external_id text,
  purchase_invoice_external_id text,
  document_number text,
  issued_date timestamptz,
  net_amount numeric,
  tax_amount numeric,
  total_amount numeric,
  currency_code text,
  status text,
  source_updated_at timestamptz,
  payload_hash text not null,
  source_payload jsonb not null,
  observed_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  unique (organization_id, source_id, external_id)
);

create table if not exists integration.laudus_accounting_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete restrict,
  external_id text not null,
  entry_number text,
  entry_date timestamptz,
  journal_code text,
  entry_type text,
  description text,
  cost_center_external_id text,
  debit_total numeric,
  credit_total numeric,
  currency_code text,
  source_updated_at timestamptz,
  payload_hash text not null,
  source_payload jsonb not null,
  observed_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  unique (organization_id, source_id, external_id)
);

create table if not exists integration.laudus_bank_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete restrict,
  external_id text not null,
  bank_external_id text,
  bank_account_external_id text,
  statement_number text,
  date_from timestamptz,
  date_to timestamptz,
  opening_balance numeric,
  closing_balance numeric,
  currency_code text,
  source_updated_at timestamptz,
  payload_hash text not null,
  source_payload jsonb not null,
  observed_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  unique (organization_id, source_id, external_id)
);

create table if not exists integration.laudus_dtes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete restrict,
  external_id text not null,
  document_type text,
  folio text,
  issuer_tax_id text,
  receiver_tax_id text,
  issued_date timestamptz,
  net_amount numeric,
  tax_amount numeric,
  total_amount numeric,
  currency_code text,
  status text,
  source_updated_at timestamptz,
  payload_hash text not null,
  source_payload jsonb not null,
  observed_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  unique (organization_id, source_id, external_id)
);

create index if not exists laudus_accounts_payable_org_due_idx
  on integration.laudus_accounts_payable (organization_id, due_date desc);
create index if not exists laudus_accounts_payable_org_supplier_idx
  on integration.laudus_accounts_payable (organization_id, supplier_external_id);
create index if not exists laudus_credit_notes_org_date_idx
  on integration.laudus_credit_notes (organization_id, issued_date desc);
create index if not exists laudus_accounting_entries_org_date_idx
  on integration.laudus_accounting_entries (organization_id, entry_date desc);
create index if not exists laudus_accounting_entries_org_cost_center_idx
  on integration.laudus_accounting_entries (organization_id, cost_center_external_id);
create index if not exists laudus_bank_statements_org_date_idx
  on integration.laudus_bank_statements (organization_id, date_to desc);
create index if not exists laudus_dtes_org_date_idx
  on integration.laudus_dtes (organization_id, issued_date desc);
create index if not exists laudus_dtes_org_issuer_folio_idx
  on integration.laudus_dtes (organization_id, issuer_tax_id, folio);

alter table integration.laudus_accounts_payable enable row level security;
alter table integration.laudus_credit_notes enable row level security;
alter table integration.laudus_accounting_entries enable row level security;
alter table integration.laudus_bank_statements enable row level security;
alter table integration.laudus_dtes enable row level security;

revoke all on integration.laudus_accounts_payable from public, anon, authenticated;
revoke all on integration.laudus_credit_notes from public, anon, authenticated;
revoke all on integration.laudus_accounting_entries from public, anon, authenticated;
revoke all on integration.laudus_bank_statements from public, anon, authenticated;
revoke all on integration.laudus_dtes from public, anon, authenticated;

grant select, insert, update on integration.laudus_accounts_payable to service_role;
grant select, insert, update on integration.laudus_credit_notes to service_role;
grant select, insert, update on integration.laudus_accounting_entries to service_role;
grant select, insert, update on integration.laudus_bank_statements to service_role;
grant select, insert, update on integration.laudus_dtes to service_role;

create or replace view public.laudus_accounts_payable_service_v1
with (security_invoker = true) as
select * from integration.laudus_accounts_payable;

create or replace view public.laudus_credit_notes_service_v1
with (security_invoker = true) as
select * from integration.laudus_credit_notes;

create or replace view public.laudus_accounting_entries_service_v1
with (security_invoker = true) as
select * from integration.laudus_accounting_entries;

create or replace view public.laudus_bank_statements_service_v1
with (security_invoker = true) as
select * from integration.laudus_bank_statements;

create or replace view public.laudus_dtes_service_v1
with (security_invoker = true) as
select * from integration.laudus_dtes;

revoke all on public.laudus_accounts_payable_service_v1 from public, anon, authenticated;
revoke all on public.laudus_credit_notes_service_v1 from public, anon, authenticated;
revoke all on public.laudus_accounting_entries_service_v1 from public, anon, authenticated;
revoke all on public.laudus_bank_statements_service_v1 from public, anon, authenticated;
revoke all on public.laudus_dtes_service_v1 from public, anon, authenticated;

grant select on public.laudus_accounts_payable_service_v1 to service_role;
grant select on public.laudus_credit_notes_service_v1 to service_role;
grant select on public.laudus_accounting_entries_service_v1 to service_role;
grant select on public.laudus_bank_statements_service_v1 to service_role;
grant select on public.laudus_dtes_service_v1 to service_role;

comment on table integration.laudus_accounts_payable is 'Laudus accounts-payable staging evidence. External financial source; never canonical MOTIL approval state.';
comment on table integration.laudus_credit_notes is 'Laudus supplier credit-note staging evidence. External financial source; never canonical MOTIL approval state.';
comment on table integration.laudus_accounting_entries is 'Laudus accounting-entry staging evidence. Full source document retained in source_payload.';
comment on table integration.laudus_bank_statements is 'Laudus bank-statement staging evidence. Full source document retained in source_payload.';
comment on table integration.laudus_dtes is 'Laudus DTE staging evidence. Fiscal source evidence only; does not replace SII or MOTIL human approval.';
