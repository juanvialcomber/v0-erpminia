-- Prefer actual normative section content over table-of-contents hits.
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
  order by (strpos(upper(left(c.body,180)), 'ÍNDICE') = 0) desc,
           (strpos(lower(left(c.body,400)), lower(trim(query_text))) > 0) desc,
           ts_rank_cd(c.search_vector, websearch_to_tsquery('spanish',left(query_text,300))) desc,
           c.document_id, c.page_number, c.chunk_index
  limit least(greatest(coalesce(max_results,6),1),8);
$body$;
revoke all on function public.search_engineering_mop_v1(text,integer) from public, anon, authenticated;
grant execute on function public.search_engineering_mop_v1(text,integer) to service_role;

