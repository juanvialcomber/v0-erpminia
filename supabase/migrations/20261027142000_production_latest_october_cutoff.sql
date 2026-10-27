-- Keep October 2026 sector intelligence on the latest canonical source cutoff.
-- Historical snapshots remain preserved in production_source_normalized_records.

create or replace view public.motil_oct2026_sector_breakdown_v1 as
with eligible as (
  select
    r.organization_id,
    r.source_file,
    r.source_file_sha256,
    r.source_sheet,
    r.source_row,
    r.entity_label,
    r.source_values,
    r.normalized_values,
    (r.normalized_values ->> 'cutoff')::date as cutoff_date
  from public.production_source_normalized_records r
  join public.production_source_documents d
    on d.organization_id=r.organization_id
   and d.source_file_sha256=r.source_file_sha256
  where r.domain='production'
    and r.record_type='sector_monthly_actual_plan_source'
    and r.semantic_status='source_reported'
    and r.period_start='2026-10-01'::date
    and trim(r.source_sheet)='OCTUBRE 2026'
    and d.source_kind='actual'
    and d.canonical_role='canonical'
    and (r.normalized_values ->> 'cutoff') is not null
),
latest as (
  select organization_id,max(cutoff_date) as cutoff_date
  from eligible
  group by organization_id
)
select
  e.organization_id,
  e.source_file,
  e.source_file_sha256,
  e.source_sheet,
  e.source_row,
  e.entity_label as sector_name,
  e.normalized_values ->> 'mine' as mine_name,
  e.normalized_values ->> 'section' as sector_group,
  e.cutoff_date,
  (e.normalized_values ->> 'actual_to_cutoff_t')::numeric as actual_to_cutoff_t,
  (e.normalized_values ->> 'plan_to_cutoff_t')::numeric as planned_to_cutoff_t,
  (e.normalized_values ->> 'monthly_plan_t')::numeric as monthly_plan_t,
  (e.normalized_values ->> 'forecast_month_t')::numeric as forecast_month_t,
  e.source_values ->> 'reported_compliance_cache' as source_compliance_cache,
  case
    when (e.source_values ->> 'reported_compliance_cache') like '#%' then 'source_formula_error'
    when (e.normalized_values ->> 'actual_was_blank')='true' then 'source_actual_blank'
    else 'source_reported'
  end as source_quality_status,
  false as canonically_posted,
  'SOURCE_ONLY'::text as publication_status
from eligible e
join latest l
  on l.organization_id=e.organization_id
 and l.cutoff_date=e.cutoff_date;

comment on view public.motil_oct2026_sector_breakdown_v1 is
'Latest canonical October 2026 sector snapshot by organization. Historical source snapshots remain immutable; the view advances automatically to the newest eligible cutoff.';
