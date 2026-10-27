-- Move October stock intelligence from a pinned 14-Oct workbook to the latest canonical stock cutoff.
-- Historical weekly snapshots remain preserved.

create or replace view public.motil_oct2026_stock_daily_source_v1 as
with eligible as (
  select
    r.organization_id,
    r.source_file,
    r.source_file_sha256,
    r.source_sheet,
    r.source_row,
    r.record_type,
    r.entity_label,
    r.source_values,
    r.normalized_values,
    (r.normalized_values ->> 'cutoff')::date as cutoff_date
  from public.production_source_normalized_records r
  join public.production_source_documents d
    on d.organization_id=r.organization_id
   and d.source_file_sha256=r.source_file_sha256
  where r.domain='production'
    and r.semantic_status='source_reported'
    and r.record_type like 'stock_%'
    and d.source_kind='actual'
    and d.canonical_role='canonical'
    and (r.normalized_values ->> 'cutoff') is not null
    and (r.normalized_values ->> 'cutoff')::date between '2026-10-01'::date and '2026-10-31'::date
),
latest as (
  select organization_id,max(cutoff_date) as cutoff_date
  from eligible
  group by organization_id
)
select
  r.organization_id,
  r.source_file,
  r.source_file_sha256,
  r.source_sheet,
  r.source_row,
  r.record_type,
  r.entity_label,
  j.key::date as operation_date,
  (j.value #>> '{}')::numeric as reported_value_t,
  r.normalized_values ->> 'role' as semantic_role,
  case
    when r.record_type like 'stock_sector_%' then 'mine_sector_extraction'
    when r.record_type in ('stock_week_extraction_don_jaime','stock_week_extraction_peumo') then 'mine_extraction_total'
    when r.record_type='stock_week_transport_total' then 'material_transport_total'
    when r.record_type='stock_week_consumption_plant' then 'plant_consumption'
    when r.record_type='stock_week_net_change' then 'derived_net_change'
    when r.normalized_values ->> 'role' = 'snapshot_balance' then 'plant_stock_snapshot'
    else 'other'
  end as metric_family,
  coalesce(
    nullif(r.normalized_values ->> 'mine',''),
    case
      when r.record_type like 'stock_sector_don_jaime_%' or r.record_type='stock_week_extraction_don_jaime' then 'Don Jaime'
      when r.record_type like 'stock_sector_peumo_%' or r.record_type='stock_week_extraction_peumo' then 'Peumo'
      else null
    end
  ) as mine_name,
  r.source_values -> 'daily_cells' ->> j.key as original_cell_address,
  'source_reported_not_canonical'::text as publication_status,
  false as changes_canonical_production
from eligible r
join latest l
  on l.organization_id=r.organization_id
 and l.cutoff_date=r.cutoff_date
cross join lateral jsonb_each(
  coalesce(
    r.normalized_values -> 'daily_actual',
    r.normalized_values -> 'daily_actual_through_cutoff',
    '{}'::jsonb
  )
) j(key,value)
where jsonb_typeof(j.value)='number'
  and r.normalized_values ->> 'unit'='t';

create or replace view public.motil_oct2026_stock_reconciliation_v1 as
with eligible as (
  select
    r.organization_id,
    r.source_file_sha256,
    r.source_sheet,
    r.record_type,
    (r.normalized_values ->> 'value')::numeric as v,
    r.normalized_values ->> 'role' as role_key,
    r.normalized_values ->> 'mine' as mine_key,
    (r.normalized_values ->> 'cutoff')::date as cutoff_date
  from public.production_source_normalized_records r
  join public.production_source_documents d
    on d.organization_id=r.organization_id
   and d.source_file_sha256=r.source_file_sha256
  where r.domain='production'
    and r.semantic_status='source_reported'
    and r.record_type like 'stock_%'
    and d.source_kind='actual'
    and d.canonical_role='canonical'
    and (r.normalized_values ->> 'cutoff') is not null
    and (r.normalized_values ->> 'cutoff')::date between '2026-10-01'::date and '2026-10-31'::date
),
latest as (
  select organization_id,max(cutoff_date) as cutoff_date
  from eligible
  group by organization_id
),
src as (
  select e.*
  from eligible e
  join latest l
    on l.organization_id=e.organization_id
   and l.cutoff_date=e.cutoff_date
),
agg as (
  select
    organization_id,
    source_file_sha256,
    count(*) as source_indicator_rows,
    sum(v) filter (where role_key='sector_actual' and mine_key='Don Jaime') as don_jaime_sector_sum_t,
    sum(v) filter (where role_key='sector_actual' and mine_key='Peumo') as peumo_sector_sum_t,
    max(v) filter (where record_type='stock_week_extraction_don_jaime') as don_jaime_total_t,
    max(v) filter (where record_type='stock_week_extraction_peumo') as peumo_total_t,
    max(v) filter (where record_type='stock_week_transport_total') as transported_total_t,
    max(v) filter (where record_type='stock_week_consumption_plant') as consumption_total_t,
    max(v) filter (where record_type='stock_week_net_change') as net_change_total_t,
    max(v) filter (where role_key='snapshot_balance') as stock_plant_oct14_t,
    max(v) filter (where record_type='stock_oxide_cancha_molle') as oxide_stock_t,
    max(v) filter (where record_type='stock_sulfide_raiz_cobre') as sulfide_stock_t,
    max(v) filter (where role_key='snapshot_total') as total_mineral_stock_t
  from src
  group by organization_id,source_file_sha256
)
select
  organization_id,
  source_file_sha256,
  source_indicator_rows,
  don_jaime_sector_sum_t,
  peumo_sector_sum_t,
  don_jaime_total_t,
  peumo_total_t,
  transported_total_t,
  consumption_total_t,
  net_change_total_t,
  stock_plant_oct14_t,
  oxide_stock_t,
  sulfide_stock_t,
  total_mineral_stock_t,
  abs(don_jaime_sector_sum_t-don_jaime_total_t)<0.00001 as don_jaime_sector_check,
  abs(peumo_sector_sum_t-peumo_total_t)<0.00001 as peumo_sector_check,
  abs(don_jaime_total_t+peumo_total_t-transported_total_t)<0.00001 as transport_sources_check,
  abs(transported_total_t+consumption_total_t-net_change_total_t)<0.00001 as stock_net_change_check,
  abs(stock_plant_oct14_t+oxide_stock_t+sulfide_stock_t-total_mineral_stock_t)<0.00001 as mineral_stock_components_check,
  false as posted_to_daily_plant_shifts
from agg;

comment on view public.motil_oct2026_stock_daily_source_v1 is
'Daily stock/extraction evidence from the latest canonical October 2026 stock cutoff. Historical weeks remain preserved.';
comment on view public.motil_oct2026_stock_reconciliation_v1 is
'Integrity checks for the latest canonical October 2026 stock cutoff. Legacy output column stock_plant_oct14_t is retained for compatibility but now represents the latest stock snapshot.';
