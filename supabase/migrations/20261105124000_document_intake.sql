insert into storage.buckets (id, name, public)
values ('document-intake', 'document-intake', false)
on conflict (id) do update set public = false;

create table if not exists public.document_intake_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  storage_bucket text not null default 'document-intake',
  storage_path text not null,
  original_name text not null,
  mime_type text,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  sha256 text not null check (char_length(sha256) = 64),
  source text not null default 'manual_upload',
  area text,
  source_path text,
  status text not null default 'pending_classification'
    check (status in ('pending_classification','classified','linked','duplicate','rejected','archived')),
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  classified_at timestamptz,
  linked_at timestamptz
);

create index if not exists document_intake_org_status_created_idx
  on public.document_intake_items (organization_id, status, created_at desc);

create index if not exists document_intake_org_sha_idx
  on public.document_intake_items (organization_id, sha256);

alter table public.document_intake_items enable row level security;

comment on table public.document_intake_items is
  'Server-managed staging metadata for raw document intake before canonical classification.';
