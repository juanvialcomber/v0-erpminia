-- MOTIL HSE textual staging. No autoapproval; source documents remain immutable.
create table if not exists canonical.hse_document_fragments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_document_id uuid not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_file_path text not null,
  page_number integer,
  section_number integer not null check (section_number > 0),
  extraction_method text not null check (extraction_method in ('native','libreoffice','ocr_tesseract_spa_eng')),
  fragment_text text not null check (length(btrim(fragment_text)) > 0),
  fragment_sha256 text not null check (fragment_sha256 ~ '^[0-9a-f]{64}$'),
  validation_status text not null default 'pending' check (validation_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now(),
  unique nulls not distinct (source_document_id,source_sha256,page_number,section_number,fragment_sha256)
);
create index if not exists hse_document_fragments_org_doc_idx on canonical.hse_document_fragments (organization_id,source_document_id);
alter table canonical.hse_document_fragments enable row level security;
revoke all on canonical.hse_document_fragments from anon, authenticated;
grant usage on schema canonical to service_role;
grant select,insert on canonical.hse_document_fragments to service_role;
create or replace function public.stage_hse_document_fragments(p_rows jsonb)
returns integer
language plpgsql security definer set search_path = pg_catalog
as $$
declare v_count integer := 0;
begin
 if auth.role() <> 'service_role' then raise exception 'service_role required'; end if;
 if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 150 then raise exception 'invalid batch'; end if;
 insert into canonical.hse_document_fragments (
  organization_id,source_document_id,source_sha256,source_file_path,
  page_number,section_number,extraction_method,fragment_text,fragment_sha256
 )
 select d.organization_id,d.id,x.source_sha256,d.file_path,
        x.page_number,x.section_number,x.extraction_method,x.fragment_text,x.fragment_sha256
 from jsonb_to_recordset(p_rows) as x(
  source_document_id uuid,source_sha256 text,page_number integer,
  section_number integer,extraction_method text,fragment_text text,fragment_sha256 text
 )
 join public.module_documents d on d.id=x.source_document_id
 where d.organization_id is not null
   and d.file_path like 'prevencion/documentos-hse/%'
   and (lower(right(d.file_path,4)) = '.pdf' or lower(right(d.file_path,4)) = '.doc')
 on conflict do nothing;
 get diagnostics v_count = row_count;
 return v_count;
end;
$$;
revoke all on function public.stage_hse_document_fragments(jsonb) from public, anon, authenticated;
grant execute on function public.stage_hse_document_fragments(jsonb) to service_role;
