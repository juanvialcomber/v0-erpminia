-- Improve fixed-asset candidate generation with deterministic identifiers.
-- Exact plate embedded in Laudus name or exact serial raises evidence only.
-- No candidate is auto-promoted to canonical identity.

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
  evidence_level text,
  exact_plate_support boolean,
  exact_serial_support boolean,
  model_support boolean,
  manufacturer_support boolean
)
language sql
security definer
set search_path = public, integration, canonical, pg_temp
as $function$
with scored as (
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
    (
      lower(regexp_replace(coalesce(c.license_plate,''),'[^a-zA-Z0-9]','','g')) <> ''
      and position(
        lower(regexp_replace(coalesce(c.license_plate,''),'[^a-zA-Z0-9]','','g'))
        in lower(regexp_replace(coalesce(l.name,''),'[^a-zA-Z0-9]','','g'))
      ) > 0
    ) as exact_plate_support,
    (
      lower(regexp_replace(coalesce(l.serial_number,''),'[^a-zA-Z0-9]','','g')) <> ''
      and lower(regexp_replace(coalesce(c.serial_number,''),'[^a-zA-Z0-9]','','g')) <> ''
      and lower(regexp_replace(coalesce(l.serial_number,''),'[^a-zA-Z0-9]','','g'))
          = lower(regexp_replace(coalesce(c.serial_number,''),'[^a-zA-Z0-9]','','g'))
    ) as exact_serial_support,
    (
      lower(regexp_replace(coalesce(l.model,''),'[^a-zA-Z0-9]','','g')) <> ''
      and lower(regexp_replace(coalesce(c.model,''),'[^a-zA-Z0-9]','','g')) <> ''
      and (
        lower(regexp_replace(coalesce(l.model,''),'[^a-zA-Z0-9]','','g'))
          = lower(regexp_replace(coalesce(c.model,''),'[^a-zA-Z0-9]','','g'))
        or lower(regexp_replace(coalesce(l.model,''),'[^a-zA-Z0-9]','','g'))
          like '%' || lower(regexp_replace(coalesce(c.model,''),'[^a-zA-Z0-9]','','g')) || '%'
        or lower(regexp_replace(coalesce(c.model,''),'[^a-zA-Z0-9]','','g'))
          like '%' || lower(regexp_replace(coalesce(l.model,''),'[^a-zA-Z0-9]','','g')) || '%'
      )
    ) as model_support,
    (
      lower(regexp_replace(coalesce(l.manufacturer,''),'[^a-zA-Z0-9]','','g')) <> ''
      and lower(regexp_replace(coalesce(c.manufacturer,''),'[^a-zA-Z0-9]','','g')) <> ''
      and (
        lower(regexp_replace(coalesce(l.manufacturer,''),'[^a-zA-Z0-9]','','g'))
          = lower(regexp_replace(coalesce(c.manufacturer,''),'[^a-zA-Z0-9]','','g'))
        or lower(regexp_replace(coalesce(l.manufacturer,''),'[^a-zA-Z0-9]','','g'))
          like '%' || lower(regexp_replace(coalesce(c.manufacturer,''),'[^a-zA-Z0-9]','','g')) || '%'
        or lower(regexp_replace(coalesce(c.manufacturer,''),'[^a-zA-Z0-9]','','g'))
          like '%' || lower(regexp_replace(coalesce(l.manufacturer,''),'[^a-zA-Z0-9]','','g')) || '%'
      )
    ) as manufacturer_support
  from integration.laudus_fixed_assets l
  cross join canonical.assets c
  where l.organization_id=p_organization_id
    and c.organization_id=p_organization_id
    and l.reconciliation_status <> 'matched'
),
ranked as (
  select *,
    row_number() over (
      partition by external_id
      order by
        (exact_serial_support or exact_plate_support) desc,
        ((model_support::int + manufacturer_support::int)) desc,
        name_similarity desc,
        canonical_asset_id
    ) as rn
  from scored
  where name_similarity >= 0.50
     or exact_plate_support
     or exact_serial_support
     or (model_support and manufacturer_support)
),
best as (
  select
    external_id,
    max(laudus_name) as laudus_name,
    max(laudus_manufacturer) as laudus_manufacturer,
    max(laudus_model) as laudus_model,
    max(laudus_serial_number) as laudus_serial_number,
    (max(canonical_asset_id::text) filter(where rn=1))::uuid as canonical_asset_id,
    max(canonical_asset_code) filter(where rn=1) as canonical_asset_code,
    max(canonical_asset_name) filter(where rn=1) as canonical_asset_name,
    max(name_similarity) filter(where rn=1) as best_score,
    max(name_similarity) filter(where rn=2) as second_score,
    bool_or(exact_plate_support) filter(where rn=1) as exact_plate_support,
    bool_or(exact_serial_support) filter(where rn=1) as exact_serial_support,
    bool_or(model_support) filter(where rn=1) as model_support,
    bool_or(manufacturer_support) filter(where rn=1) as manufacturer_support
  from ranked
  where rn<=2
  group by external_id
),
reverse_counts as (
  select canonical_asset_id,count(*) as source_rows
  from best
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
  round(b.best_score,3),
  round(coalesce(b.second_score,0),3),
  round((b.best_score-coalesce(b.second_score,0)),3),
  coalesce(r.source_rows,0),
  case
    when b.exact_serial_support or b.exact_plate_support then 'strong_identifier_candidate'
    when coalesce(r.source_rows,0)>1 and b.best_score>=0.60 then 'many_to_one_review'
    when b.best_score>=0.75 and b.best_score-coalesce(b.second_score,0)>=0.15 then 'strong_candidate'
    when b.model_support and b.manufacturer_support and b.best_score>=0.55 then 'supported_candidate'
    when b.best_score>=0.60 and b.best_score-coalesce(b.second_score,0)>=0.10 then 'candidate'
    when b.best_score>=0.50 then 'ambiguous'
    else 'insufficient_evidence'
  end,
  b.exact_plate_support,
  b.exact_serial_support,
  b.model_support,
  b.manufacturer_support
from best b
left join reverse_counts r using(canonical_asset_id)
order by
  case
    when b.exact_serial_support or b.exact_plate_support then 1
    when b.best_score>=0.75 and b.best_score-coalesce(b.second_score,0)>=0.15 then 2
    when b.model_support and b.manufacturer_support and b.best_score>=0.55 then 3
    when coalesce(r.source_rows,0)>1 and b.best_score>=0.60 then 4
    when b.best_score>=0.60 and b.best_score-coalesce(b.second_score,0)>=0.10 then 5
    else 6
  end,
  b.best_score desc,
  b.external_id
limit greatest(1,least(coalesce(p_limit,100),500));
$function$;

revoke all on function public.motil_get_laudus_fixed_asset_candidates(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.motil_get_laudus_fixed_asset_candidates(uuid,integer)
  to service_role;

comment on function public.motil_get_laudus_fixed_asset_candidates(uuid,integer)
  is 'Read-only fixed-asset candidates. Exact plate/serial and model/manufacturer are evidence only; all identity promotion requires human review.';
