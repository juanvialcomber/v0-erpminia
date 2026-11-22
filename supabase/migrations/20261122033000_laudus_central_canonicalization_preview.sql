-- Read-only, product-level preview for adopting Laudus Bodega Central (002)
-- as a MOTIL opening balance. No stock is written by these views.
-- Fractional balances remain review-only until operational movement quantities
-- support their precision.

create or replace view public.bodega_central_stock_canonicalization_preview_v1
with (security_invoker = true)
as
with central_warehouse as (
  select organization_id, external_id, motil_warehouse_id
  from integration.laudus_warehouses
  where external_id = '002'
    and reconciliation_status = 'matched'
    and motil_warehouse_id is not null
),
source_by_product as (
  select
    p.organization_id,
    p.canonical_product_id,
    min(p.external_id) as product_external_id,
    upper(trim(min(p.sku))) as sku,
    min(p.description) as description,
    min(p.unit_of_measure) as unit_of_measure,
    count(distinct p.external_id)::integer as source_identity_count,
    coalesce(sum(s.stock), 0)::numeric as source_quantity,
    count(s.id)::integer as source_position_count,
    coalesce(bool_or(s.stock < 0), false) as has_negative_position,
    coalesce(bool_or(s.stock <> trunc(s.stock)), false) as has_fractional_position,
    max(s.source_date_to) as source_cutoff,
    max(s.synced_at) as source_synced_at
  from integration.laudus_products p
  join central_warehouse w on w.organization_id = p.organization_id
  left join integration.laudus_product_stock s
    on s.organization_id = p.organization_id
   and s.product_external_id = p.external_id
   and s.warehouse_external_id = w.external_id
  where p.inventory_eligibility = 'eligible'
    and p.reconciliation_status = 'matched'
    and p.canonical_product_id is not null
    and nullif(trim(p.sku), '') is not null
  group by p.organization_id, p.canonical_product_id
),
movement_count as (
  select stock_id, count(*)::integer as movement_count
  from public.stock_movements
  group by stock_id
),
central_motil as (
  select
    ws.organization_id,
    ws.canonical_product_id,
    count(*)::integer as row_count,
    sum(coalesce(ws.quantity_on_hand, 0))::numeric as quantity,
    sum(coalesce(mc.movement_count, 0))::integer as movement_count
  from public.warehouse_stock ws
  join central_warehouse w
    on w.organization_id = ws.organization_id
   and w.motil_warehouse_id = ws.warehouse_id
  left join movement_count mc on mc.stock_id = ws.id
  where ws.canonical_product_id is not null
  group by ws.organization_id, ws.canonical_product_id
),
unassigned_motil as (
  select
    ws.organization_id,
    ws.canonical_product_id,
    count(*)::integer as row_count,
    sum(coalesce(ws.quantity_on_hand, 0))::numeric as quantity,
    sum(coalesce(mc.movement_count, 0))::integer as movement_count,
    min(ws.id::text)::uuid as reusable_stock_id
  from public.warehouse_stock ws
  left join movement_count mc on mc.stock_id = ws.id
  where ws.warehouse_id is null
    and ws.canonical_product_id is not null
  group by ws.organization_id, ws.canonical_product_id
),
readiness as (
  select organization_id, authority_state, authority_reason
  from public.bodega_stock_source_authority_service_v1
)
select
  s.organization_id,
  w.motil_warehouse_id as warehouse_id,
  s.canonical_product_id,
  s.product_external_id,
  s.sku,
  s.description,
  s.unit_of_measure,
  s.source_quantity,
  s.source_position_count,
  s.source_identity_count,
  s.has_negative_position,
  s.has_fractional_position,
  s.source_cutoff,
  s.source_synced_at,
  r.authority_state,
  r.authority_reason,
  cm.row_count as central_motil_row_count,
  cm.quantity as central_motil_quantity,
  cm.movement_count as central_motil_movement_count,
  um.row_count as unassigned_motil_row_count,
  um.quantity as unassigned_motil_quantity,
  um.movement_count as unassigned_motil_movement_count,
  um.reusable_stock_id,
  case
    when s.source_identity_count > 1 then 'review_identity_conflict'
    when s.has_negative_position then 'review_negative_source'
    when s.source_synced_at is null or now() - s.source_synced_at > interval '8 hours' then 'review_stale_source'
    when coalesce(r.authority_state, '') <> 'laudus_primary' then 'review_source_authority'
    when s.has_fractional_position then 'review_fractional_precision'
    when cm.row_count > 0 and cm.row_count = 1 and cm.quantity = s.source_quantity then 'already_canonical'
    when cm.row_count > 0 then 'review_existing_central_balance'
    when coalesce(um.row_count, 0) > 1 then 'review_duplicate_unassigned_rows'
    when coalesce(um.row_count, 0) = 1
      and coalesce(um.quantity, 0) = 0
      and coalesce(um.movement_count, 0) = 0 then 'candidate_assign_zero_row'
    when coalesce(um.row_count, 0) = 1 then 'review_unassigned_balance_or_history'
    when s.source_quantity = 0 then 'zero_no_opening_balance'
    else 'candidate_create_opening_row'
  end as canonicalization_state
from source_by_product s
join central_warehouse w on w.organization_id = s.organization_id
left join central_motil cm
  on cm.organization_id = s.organization_id
 and cm.canonical_product_id = s.canonical_product_id
left join unassigned_motil um
  on um.organization_id = s.organization_id
 and um.canonical_product_id = s.canonical_product_id
left join readiness r on r.organization_id = s.organization_id;

revoke all on public.bodega_central_stock_canonicalization_preview_v1 from public, anon, authenticated;
grant select on public.bodega_central_stock_canonicalization_preview_v1 to service_role;

create or replace view public.bodega_central_stock_canonicalization_summary_v1
with (security_invoker = true)
as
select
  organization_id,
  warehouse_id,
  max(source_cutoff) as source_cutoff,
  max(source_synced_at) as source_synced_at,
  max(authority_state) as authority_state,
  count(*)::bigint as products_reviewed,
  count(*) filter (where canonicalization_state = 'candidate_assign_zero_row')::bigint as existing_zero_rows_to_assign,
  count(*) filter (where canonicalization_state = 'candidate_create_opening_row')::bigint as opening_rows_to_create,
  count(*) filter (where canonicalization_state = 'already_canonical')::bigint as already_canonical,
  count(*) filter (where canonicalization_state like 'review_%')::bigint as requires_review,
  count(*) filter (where canonicalization_state = 'review_identity_conflict')::bigint as identity_conflicts,
  count(*) filter (where canonicalization_state = 'review_negative_source')::bigint as negative_source_products,
  count(*) filter (where canonicalization_state = 'review_fractional_precision')::bigint as fractional_products,
  count(*) filter (where canonicalization_state = 'review_stale_source')::bigint as stale_source_products,
  count(*) filter (where canonicalization_state = 'zero_no_opening_balance')::bigint as zero_without_position
from public.bodega_central_stock_canonicalization_preview_v1
group by organization_id, warehouse_id;

revoke all on public.bodega_central_stock_canonicalization_summary_v1 from public, anon, authenticated;
grant select on public.bodega_central_stock_canonicalization_summary_v1 to service_role;

comment on view public.bodega_central_stock_canonicalization_preview_v1 is
  'Read-only per-product eligibility preview for a Laudus Central (002) opening balance in MOTIL. Never writes stock; negative, duplicated, stale, fractional, active, or ambiguous rows require review.';
comment on view public.bodega_central_stock_canonicalization_summary_v1 is
  'Read-only aggregate of opening-balance candidates and exceptions for Laudus Bodega Central (002).';
