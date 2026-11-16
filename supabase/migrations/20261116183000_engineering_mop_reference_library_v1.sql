-- MOTIL Ingeniería: lectura normativa MOP 2025. Reference data only; no operational mutations.
-- RLS fail-closed: the service-role backend is the only API consumer after cargo/module/tenant authorization.
create table if not exists public.engineering_mop_documents_v1 (
  id text primary key,
  edition text not null check (edition ~ '^[0-9]{4}$'),
  kind text not null check (kind in ('volume','resolution','partidas')),
  volume smallint check (volume between 1 and 9),
  title text not null,
  source_filename text not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_url text not null,
  page_count integer check (page_count is null or page_count > 0),
  text_page_count integer not null default 0 check (text_page_count >= 0),
  storage_bucket text,
  storage_path text,
  ingestion_state text not null default 'pending' check (ingestion_state in ('pending','text_indexed','archived')),
  indexed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_sha256)
);
create table if not exists public.engineering_mop_chunks_v1 (
  document_id text not null references public.engineering_mop_documents_v1(id) on delete restrict,
  page_number integer not null check (page_number > 0),
  chunk_index integer not null check (chunk_index >= 0),
  section_ref text,
  body text not null check (length(body) between 1 and 3000),
  search_vector tsvector generated always as (
    to_tsvector('spanish', coalesce(section_ref,'') || ' ' || body)
  ) stored,
  primary key (document_id,page_number,chunk_index)
);
create index if not exists engineering_mop_chunks_v1_search_idx
  on public.engineering_mop_chunks_v1 using gin(search_vector);
create index if not exists engineering_mop_chunks_v1_section_idx
  on public.engineering_mop_chunks_v1 (section_ref) where section_ref is not null;
create table if not exists public.engineering_mop_partidas_v1 (
  document_id text not null references public.engineering_mop_documents_v1(id) on delete restrict,
  item_code text not null,
  chapter_code text not null,
  chapter_name text not null,
  description text not null,
  unit text not null,
  source_row integer not null check (source_row >= 4),
  search_vector tsvector generated always as (
    to_tsvector('spanish', item_code || ' ' || chapter_name || ' ' || description)
  ) stored,
  primary key (document_id,item_code)
);
create index if not exists engineering_mop_partidas_v1_search_idx
  on public.engineering_mop_partidas_v1 using gin(search_vector);

alter table public.engineering_mop_documents_v1 enable row level security;
alter table public.engineering_mop_chunks_v1 enable row level security;
alter table public.engineering_mop_partidas_v1 enable row level security;
revoke all on public.engineering_mop_documents_v1 from public, anon, authenticated;
revoke all on public.engineering_mop_chunks_v1 from public, anon, authenticated;
revoke all on public.engineering_mop_partidas_v1 from public, anon, authenticated;
grant select, insert, update on public.engineering_mop_documents_v1 to service_role;
grant select, insert, update on public.engineering_mop_chunks_v1 to service_role;
grant select, insert, update on public.engineering_mop_partidas_v1 to service_role;

create or replace function public.search_engineering_mop_v1(
  query_text text,
  max_results integer default 6
)
returns table (
  document_id text,
  document_title text,
  source_sha256 text,
  edition text,
  volume smallint,
  page_number integer,
  chunk_index integer,
  section_ref text,
  excerpt text,
  source_url text
)
language sql
stable
security invoker
set search_path = ''
as $body$
  select c.document_id, d.title, d.source_sha256, d.edition, d.volume,
         c.page_number, c.chunk_index, c.section_ref,
         left(c.body, 1700) as excerpt, d.source_url
  from public.engineering_mop_chunks_v1 c
  inner join public.engineering_mop_documents_v1 d on d.id = c.document_id
  where d.ingestion_state = 'text_indexed'
    and d.edition = '2025'
    and length(trim(coalesce(query_text,''))) between 2 and 300
    and (
      c.search_vector @@ websearch_to_tsquery('spanish', left(query_text,300))
      or (length(trim(query_text)) <= 32 and c.section_ref = trim(query_text))
    )
  order by ts_rank_cd(c.search_vector, websearch_to_tsquery('spanish',left(query_text,300))) desc,
           c.document_id, c.page_number, c.chunk_index
  limit least(greatest(coalesce(max_results,6),1),8);
$body$;
revoke all on function public.search_engineering_mop_v1(text,integer) from public, anon, authenticated;
grant execute on function public.search_engineering_mop_v1(text,integer) to service_role;

create or replace function public.search_engineering_mop_partidas_v1(
  query_text text,
  max_results integer default 5
)
returns table (
  item_code text, chapter_code text, description text,
  unit text, source_row integer, source_sha256 text
)
language sql stable security invoker set search_path = ''
as $body$
  select p.item_code, p.chapter_code, p.description,
         p.unit, p.source_row, d.source_sha256
  from public.engineering_mop_partidas_v1 p
  inner join public.engineering_mop_documents_v1 d on d.id = p.document_id
  where d.edition = '2025' and d.ingestion_state = 'text_indexed'
    and length(trim(coalesce(query_text,''))) between 2 and 300
    and (p.search_vector @@ websearch_to_tsquery('spanish',left(query_text,300))
      or (length(trim(query_text)) <= 25 and p.item_code = trim(query_text)))
  order by ts_rank_cd(p.search_vector,websearch_to_tsquery('spanish',left(query_text,300))) desc,
           p.chapter_code,p.item_code
  limit least(greatest(coalesce(max_results,5),1),8);
$body$;
revoke all on function public.search_engineering_mop_partidas_v1(text,integer) from public, anon, authenticated;
grant execute on function public.search_engineering_mop_partidas_v1(text,integer) to service_role;
