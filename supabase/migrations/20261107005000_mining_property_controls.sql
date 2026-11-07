create table if not exists public.mining_property_controls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  mining_property_id uuid references public.mining_properties(id) on delete set null,
  link_status text not null default 'unresolved',
  source_property_name text not null,
  national_role text,
  tenant_name text,
  contact_name text,
  patent_value_clp_source numeric,
  patent_payment_clp numeric,
  patent_payment_status text,
  lease_start_date date,
  lease_end_date date,
  lease_annex_start_date date,
  lease_annex_start_raw text,
  lease_annex_end_date date,
  sernageomin_expiry_date date,
  sernageomin_expiry_raw text,
  servitude_status text,
  powder_magazine_status text,
  source_file text not null,
  source_file_sha256 text not null,
  source_sheet text not null,
  source_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mining_property_controls_source_unique
  on public.mining_property_controls (organization_id, source_file_sha256, source_sheet);

alter table public.mining_property_controls enable row level security;

comment on table public.mining_property_controls is
  'Operational control fields extracted from Elias mining-property workbook. Canonical property identity is linked only when source identity is unambiguous.';