-- Legal contract ↔ purchase-order reconciliation ledger.
-- Schema only. No production seed is applied by this migration.
-- Candidates originate from traced Legal source files and are promoted only after canonical verification.

create table if not exists public.legal_contract_purchase_order_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  purchase_order_number text not null,
  canonical_purchase_order_id uuid null,
  status text not null default 'pending'
    check (status in ('pending','verified','conflict','not_found')),
  source_file text not null,
  source_file_sha256 text not null,
  source_sheet text not null,
  source_cell text not null,
  source_text text null,
  verification_reason text null,
  verified_by uuid null,
  verified_at timestamptz null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, contract_id, purchase_order_number, source_file_sha256)
);

create index if not exists legal_contract_po_links_org_contract_idx
  on public.legal_contract_purchase_order_links (organization_id, contract_id, status);

create index if not exists legal_contract_po_links_org_po_idx
  on public.legal_contract_purchase_order_links (organization_id, purchase_order_number, status);

alter table public.legal_contract_purchase_order_links enable row level security;

revoke all on table public.legal_contract_purchase_order_links from anon;
revoke all on table public.legal_contract_purchase_order_links from authenticated;
grant select, insert, update on table public.legal_contract_purchase_order_links to service_role;

comment on table public.legal_contract_purchase_order_links is
'Human-reviewed Legal contract to purchase-order reconciliation ledger. Source spreadsheets create candidates only; verified status requires canonical purchase-order evidence and compatible supplier identity.';

comment on column public.legal_contract_purchase_order_links.source_file_sha256 is
'Immutable SHA-256 of the source workbook used to create the candidate link.';
