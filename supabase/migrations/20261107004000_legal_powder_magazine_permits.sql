create table if not exists public.legal_powder_magazine_permits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_name text not null,
  resolution_number text,
  expiry_date date,
  next_expiry_date date,
  mining_property text,
  capacity numeric,
  source_file text not null,
  source_file_sha256 text not null,
  source_sheet text not null,
  source_row integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists legal_powder_magazine_permits_source_unique
  on public.legal_powder_magazine_permits (organization_id, source_file_sha256, source_sheet, source_row);

alter table public.legal_powder_magazine_permits enable row level security;

comment on table public.legal_powder_magazine_permits is
  'Canonical powder magazine / habitual consumer permit evidence imported from Elias workbook. Server-only access.';