-- DTC / SII read model for MOTIL Finanzas.
-- Safe by default: RLS enabled and no write policies. The application only reads this table
-- until authenticated organization-scoped policies and the certified SII write path are approved.

create table if not exists public.sii_dte_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  dte_type smallint not null,
  folio bigint,
  issue_date date,
  issuer_rut text not null,
  recipient_rut text,
  recipient_name text,
  description text,
  net_amount numeric(18,2),
  vat_amount numeric(18,2),
  total_amount numeric(18,2),
  currency text not null default 'CLP',
  sii_track_id text,
  sii_status text,
  payment_status text,
  laudus_document_id text,
  pdf_path text,
  xml_path text,
  source_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (dte_type > 0),
  check (currency ~ '^[A-Z]{3}$'),
  check (net_amount is null or net_amount >= 0),
  check (vat_amount is null or vat_amount >= 0),
  check (total_amount is null or total_amount >= 0)
);

create unique index if not exists sii_dte_documents_org_type_folio_uq
  on public.sii_dte_documents (organization_id, dte_type, folio)
  where folio is not null;

create index if not exists sii_dte_documents_org_issue_idx
  on public.sii_dte_documents (organization_id, issue_date desc, folio desc);

create index if not exists sii_dte_documents_org_track_idx
  on public.sii_dte_documents (organization_id, sii_track_id)
  where sii_track_id is not null;

alter table public.sii_dte_documents enable row level security;

create table if not exists public.sii_dte_status_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  dte_document_id uuid not null references public.sii_dte_documents(id) on delete cascade,
  sii_track_id text,
  status_code text not null,
  status_detail text,
  occurred_at timestamptz not null,
  source_payload jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists sii_dte_status_events_dedupe_uq
  on public.sii_dte_status_events (organization_id, dte_document_id, status_code, occurred_at);

create index if not exists sii_dte_status_events_document_idx
  on public.sii_dte_status_events (organization_id, dte_document_id, occurred_at desc);

alter table public.sii_dte_status_events enable row level security;

comment on table public.sii_dte_documents is
  'MOTIL DTC read model. SII remains the tax authority; Laudus remains ERP/accounting source during transition.';

comment on table public.sii_dte_status_events is
  'Append-only SII status evidence for DTE traceability.';
