-- Human-review candidate queue for Laudus fixed assets.
-- Similarity is evidence only; it never confirms identity or mutates canonical assets.

create or replace function public.motil_get_laudus_fixed_asset_candidates(
  p_organization_id uuid,
  p_limit integer default 100
)
returns table (
  laudus_external_id text,
  laudus_name text,
  laudus_manufacturer text,
  laudus_model text,
  laudus_serial_number text,
  canonical_asset_id uuid,
  canonical_asset_code text,
  canonical_asset_name text,
  best_name_similarity numeric,
  second_name_similarity numeric,
  score_gap numeric,
  laudus_rows_for_candidate bigint,
  evidence_level text
)
language sql
security definer
set search_path = public, integration, canonical, pg_temp
as $function$
with scores as (
  select
    l.external_id,
    l.name as laudus_name,
    l.manufacturer as laudus_manufacturer,
    l.model as laudus_model,
    l.serial_number as laudus_serial_number,
    c.id as canonical_asset_id,
    c.asset_code as canonical_asset_code,
    c.name as canonical_asset_name,
    similarity(lower(coalesce(l.name,'')), lower(coalesce(c.name,'')))::numeric as name_similarity,
    row_number() over (
      partition by l.external_id
      order by similarity(lower(coalesce(l.name,'')), lower(coalesce(c.name,''))) desc, c.id
    ) as rn
  from integration.laudus_fixed_assets l
  cross join canonical.assets c
  where l.organization_id = p_organization_id
    and c.organization_id = p_organization_id
    and l.reconciliation_status <> 'matched'
),
best as (
  select
    external_id,
    max(laudus_name) as laudus_name,
    max(laudus_manufacturer) as laudus_manufacturer,
    max(laudus_model) as laudus_model,
    max(laudus_serial_number) as laudus_serial_number,
    (max(canonical_asset_id::text) filter (where rn=1))::uuid as canonical_asset_id,
    max(canonical_asset_code) filter (where rn=1) as canonical_asset_code,
    max(canonical_asset_name) filter (where rn=1) as canonical_asset_name,
    max(name_similarity) filter (where rn=1) as best_score,
    max(name_similarity) filter (where rn=2) as second_score
  from scores
  where rn <= 2
  group by external_id
),
reverse_counts as (
  select canonical_asset_id, count(*) as source_rows
  from best
  where best_score >= 0.50
  group by canonical_asset_id
)
select
  b.external_id,
  b.laudus_name,
  b.laudus_manufacturer,
  b.laudus_model,
  b.laudus_serial_number,
  b.canonical_asset_id,
  b.canonical_asset_code,
  b.canonical_asset_name,
  round(b.best_score, 3),
  round(coalesce(b.second_score,0), 3),
  round((b.best_score-coalesce(b.second_score,0)), 3),
  coalesce(r.source_rows,0),
  case
    when coalesce(r.source_rows,0) > 1 and b.best_score >= 0.60 then 'many_to_one_review'
    when b.best_score >= 0.75 and b.best_score-coalesce(b.second_score,0) >= 0.15 then 'strong_candidate'
    when b.best_score >= 0.60 and b.best_score-coalesce(b.second_score,0) >= 0.10 then 'candidate'
    when b.best_score >= 0.50 then 'ambiguous'
    else 'insufficient_evidence'
  end
from best b
left join reverse_counts r using (canonical_asset_id)
where b.best_score >= 0.50
order by
  case
    when coalesce(r.source_rows,0) > 1 and b.best_score >= 0.60 then 2
    when b.best_score >= 0.75 and b.best_score-coalesce(b.second_score,0) >= 0.15 then 1
    when b.best_score >= 0.60 and b.best_score-coalesce(b.second_score,0) >= 0.10 then 3
    else 4
  end,
  b.best_score desc,
  b.external_id
limit greatest(1, least(coalesce(p_limit,100),500));
$function$;

revoke all on function public.motil_get_laudus_fixed_asset_candidates(uuid,integer)
  from public, anon, authenticated;
grant execute on function public.motil_get_laudus_fixed_asset_candidates(uuid,integer)
  to service_role;

comment on function public.motil_get_laudus_fixed_asset_candidates(uuid,integer)
  is 'Read-only fixed asset candidates from Laudus. Similarity is review evidence only and cannot confirm or mutate canonical asset identity.';
