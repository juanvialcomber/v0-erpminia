-- Append-only version history for contractor document replacements.
-- Additive migration: no existing folder/document is modified.
create table if not exists public.carpeta_documento_versiones (
 id uuid primary key default gen_random_uuid(),
 documento_id uuid not null references public.carpeta_documentos(id) on delete restrict,
 carpeta_id uuid not null references public.carpetas_arranque(id) on delete restrict,
 slot_index integer not null,
 file_name text not null,
 file_path text not null,
 file_size_bytes bigint,
 uploaded_by uuid,
 uploaded_at timestamptz,
 l1_status text, l1_observaciones text, l1_reviewed_by uuid, l1_reviewed_at timestamptz,
 l2_status text, l2_observaciones text, l2_reviewed_by uuid, l2_reviewed_at timestamptz,
 archived_at timestamptz not null default now(),
 archive_reason text not null default 'reemplazo'
);
create index if not exists carpeta_documento_versiones_documento_idx on public.carpeta_documento_versiones(documento_id,archived_at desc);
alter table public.carpeta_documento_versiones enable row level security;
-- No client policies: history is available only through explicitly authorized server paths.
create or replace function public.archive_eecc_document_version()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
 if old.file_path is not null and old.file_path is distinct from new.file_path then
   insert into public.carpeta_documento_versiones (
     documento_id,carpeta_id,slot_index,file_name,file_path,file_size_bytes,
     uploaded_by,uploaded_at,l1_status,l1_observaciones,l1_reviewed_by,l1_reviewed_at,
     l2_status,l2_observaciones,l2_reviewed_by,l2_reviewed_at
   ) values (
     old.id,old.carpeta_id,old.slot_index,coalesce(old.file_name,'Documento sin nombre'),
     old.file_path,old.file_size_bytes,old.uploaded_by,old.uploaded_at,
     old.l1_status,old.l1_observaciones,old.l1_reviewed_by,old.l1_reviewed_at,
     old.l2_status,old.l2_observaciones,old.l2_reviewed_by,old.l2_reviewed_at
   );
 end if;
 return new;
end;
$$;
drop trigger if exists trg_archive_eecc_document_version on public.carpeta_documentos;
create trigger trg_archive_eecc_document_version before update of file_path
on public.carpeta_documentos for each row execute function public.archive_eecc_document_version();
comment on table public.carpeta_documento_versiones is 'Immutable snapshots of replaced EECC files and their reviews. Historical objects must not be deleted from Storage.';

-- Explicit Data API contract; no new client access. RLS is unchanged.
-- Consumer: app/api/carpeta-arranque/[id]/versions/route.ts
grant select on table public.carpeta_documento_versiones to service_role;
