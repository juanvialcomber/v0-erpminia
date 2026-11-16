-- Prioritize exact MOP item codes before fuzzy textual matches, retaining private RPC grants.
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
  order by (p.item_code = trim(query_text)) desc,
           ts_rank_cd(p.search_vector,websearch_to_tsquery('spanish',left(query_text,300))) desc,
           p.chapter_code,p.item_code
  limit least(greatest(coalesce(max_results,5),1),8);
$body$;
revoke all on function public.search_engineering_mop_partidas_v1(text,integer) from public, anon, authenticated;
grant execute on function public.search_engineering_mop_partidas_v1(text,integer) to service_role;
