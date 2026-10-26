-- MOTIL: latest canonical mineral-stock reconciliation.
-- Keeps source evidence immutable and avoids hardcoded file names, sheets or cutoffs.
-- The legacy motil_oct2026_stock_reconciliation_v1 remains untouched for historical compatibility.

create or replace view public.motil_stock_reconciliation_latest_v2 as
with latest_document as (
  select distinct on (d.organization_id)
    d.organization_id,
    d.source_file,
    d.source_file_sha256,
    d.period_end
  from public.production_source_documents d
  where d.canonical_role = 'canonical'
    and d.source_kind = 'actual'
    and d.source_file ilike 'Nueva stock al %.xlsx'
    and d.period_end is not null
  order by d.organization_id, d.period_end desc, d.created_at desc
),
src as (
  select
    r.organization_id,
    r.source_file,
    r.source_file_sha256,
    ld.period_end as cutoff_date,
    r.record_type,
    r.entity_label,
    r.normalized_values,
    nullif(r.normalized_values ->> 'value', '')::numeric as value_numeric,
    r.normalized_values ->> 'role' as role_key,
    r.normalized_values ->> 'mine' as mine_key
  from public.production_source_normalized_records r
  join latest_document ld
    on ld.organization_id = r.organization_id
   and ld.source_file_sha256 = r.source_file_sha256
  where r.domain = 'production'
    and (r.normalized_values ->> 'cutoff') = ld.period_end::text
),
agg as (
  select
    organization_id,
    source_file,
    source_file_sha256,
    cutoff_date,
    count(*) as source_indicator_rows,
    sum(value_numeric) filter (
      where role_key = 'sector_actual' and mine_key = 'Don Jaime'
    ) as don_jaime_sector_sum_t,
    sum(value_numeric) filter (
      where role_key = 'sector_actual' and mine_key = 'Peumo'
    ) as peumo_sector_sum_t,
    max(value_numeric) filter (
      where record_type = 'stock_week_extraction_don_jaime'
    ) as don_jaime_total_t,
    max(value_numeric) filter (
      where record_type = 'stock_week_extraction_peumo'
    ) as peumo_total_t,
    max(value_numeric) filter (
      where record_type = 'stock_week_transport_total'
    ) as transported_total_t,
    max(value_numeric) filter (
      where record_type = 'stock_week_consumption_plant'
    ) as consumption_total_t,
    max(value_numeric) filter (
      where record_type = 'stock_week_net_change'
    ) as net_change_total_t,
    max(value_numeric) filter (
      where role_key = 'snapshot_balance'
    ) as stock_plant_t,
    max(value_numeric) filter (
      where record_type = 'stock_oxide_cancha_molle'
    ) as oxide_stock_t,
    max(value_numeric) filter (
      where record_type = 'stock_sulfide_raiz_cobre'
    ) as sulfide_stock_t,
    max(value_numeric) filter (
      where role_key = 'snapshot_total'
    ) as total_mineral_stock_t
  from src
  group by organization_id, source_file, source_file_sha256, cutoff_date
)
select
  organization_id,
  source_file,
  source_file_sha256,
  cutoff_date,
  source_indicator_rows,
  don_jaime_sector_sum_t,
  peumo_sector_sum_t,
  don_jaime_total_t,
  peumo_total_t,
  transported_total_t,
  consumption_total_t,
  net_change_total_t,
  stock_plant_t,
  oxide_stock_t,
  sulfide_stock_t,
  total_mineral_stock_t,
  case
    when don_jaime_sector_sum_t is null or don_jaime_total_t is null then false
    else abs(don_jaime_sector_sum_t - don_jaime_total_t) < 0.00001
  end as don_jaime_sector_check,
  case
    when peumo_sector_sum_t is null or peumo_total_t is null then false
    else abs(peumo_sector_sum_t - peumo_total_t) < 0.00001
  end as peumo_sector_check,
  case
    when don_jaime_total_t is null or peumo_total_t is null or transported_total_t is null then false
    else abs((don_jaime_total_t + peumo_total_t) - transported_total_t) < 0.00001
  end as transport_sources_check,
  case
    when transported_total_t is null or consumption_total_t is null or net_change_total_t is null then false
    else abs((transported_total_t + consumption_total_t) - net_change_total_t) < 0.00001
  end as stock_net_change_check,
  case
    when stock_plant_t is null or oxide_stock_t is null or sulfide_stock_t is null or total_mineral_stock_t is null then false
    else abs((stock_plant_t + oxide_stock_t + sulfide_stock_t) - total_mineral_stock_t) < 0.00001
  end as mineral_stock_components_check,
  false as posted_to_daily_plant_shifts
from agg;

comment on view public.motil_stock_reconciliation_latest_v2 is
'Latest canonical MOTIL mineral-stock reconciliation. Selects newest canonical actual stock source by period_end; does not promote source evidence into daily plant shifts.';
