-- Safe server-facing Laudus inventory reconciliation projections.
-- Read-only views only: no canonical, operational or Laudus mutation.

create or replace view public.laudus_inventory_reconciliation_service_v1
with (security_invoker = true)
as
with laudus as (
  select
    p.organization_id,
    p.external_id as product_external_id,
    p.canonical_product_id,
    upper(trim(p.sku)) as sku,
    p.description,
    p.unit_of_measure,
    p.operational_category,
    p.inventory_eligibility,
    p.reconciliation_status as product_reconciliation_status,
    coalesce(sum(s.stock), 0)::numeric as laudus_stock,
    count(s.id)::bigint as stock_position_count,
    count(*) filter (where s.stock <> 0)::bigint as nonzero_stock_position_count,
    max(s.source_date_to) as source_date_to,
    max(s.synced_at) as laudus_synced_at
  from integration.laudus_products p
  left join integration.laudus_product_stock s
    on s.organization_id = p.organization_id
   and s.product_external_id = p.external_id
  where nullif(trim(p.sku), '') is not null
    and p.inventory_eligibility = 'eligible'
    and p.reconciliation_status = 'matched'
    and p.canonical_product_id is not null
  group by
    p.organization_id,
    p.external_id,
    p.canonical_product_id,
    upper(trim(p.sku)),
    p.description,
    p.unit_of_measure,
    p.operational_category,
    p.inventory_eligibility,
    p.reconciliation_status
),
motil as (
  select distinct on (upper(trim(b.sku)))
    upper(trim(b.sku)) as sku,
    coalesce(b.quantity_reported, b.quantity::numeric) as motil_stock,
    b.unit_cost as motil_unit_cost,
    b.updated_at as motil_updated_at
  from public.bodega_inventory b
  where nullif(trim(b.sku), '') is not null
  order by upper(trim(b.sku)), b.updated_at desc nulls last, b.created_at desc nulls last
)
select
  l.organization_id,
  l.product_external_id,
  l.canonical_product_id,
  l.sku,
  l.description,
  l.unit_of_measure,
  l.operational_category,
  l.inventory_eligibility,
  l.product_reconciliation_status,
  l.laudus_stock,
  l.stock_position_count,
  l.nonzero_stock_position_count,
  l.source_date_to,
  l.laudus_synced_at,
  m.motil_stock,
  m.motil_unit_cost,
  m.motil_updated_at,
  case
    when m.sku is null then null::numeric
    else m.motil_stock - l.laudus_stock
  end as quantity_delta,
  case
    when m.sku is null and l.laudus_stock = 0 then 'laudus_only_zero'
    when m.sku is null then 'missing_in_motil'
    when abs(coalesce(m.motil_stock, 0) - coalesce(l.laudus_stock, 0)) <= 0.005 then 'aligned'
    else 'quantity_mismatch'
  end as reconciliation_state
from laudus l
left join motil m on m.sku = l.sku;

revoke all on public.laudus_inventory_reconciliation_service_v1 from public, anon, authenticated;
grant select on public.laudus_inventory_reconciliation_service_v1 to service_role;

create or replace view public.laudus_inventory_reconciliation_summary_service_v1
with (security_invoker = true)
as
select
  organization_id,
  count(*)::bigint as compared_products,
  count(*) filter (where reconciliation_state = 'aligned')::bigint as aligned_products,
  count(*) filter (where reconciliation_state = 'quantity_mismatch')::bigint as quantity_mismatches,
  count(*) filter (where reconciliation_state = 'missing_in_motil')::bigint as missing_in_motil_nonzero,
  count(*) filter (where reconciliation_state = 'laudus_only_zero')::bigint as laudus_only_zero,
  count(*) filter (where laudus_stock < 0)::bigint as laudus_negative_products,
  max(laudus_synced_at) as latest_laudus_stock_sync,
  max(motil_updated_at) as latest_motil_stock_update
from public.laudus_inventory_reconciliation_service_v1
group by organization_id;

revoke all on public.laudus_inventory_reconciliation_summary_service_v1 from public, anon, authenticated;
grant select on public.laudus_inventory_reconciliation_summary_service_v1 to service_role;

create or replace view public.laudus_inventory_readiness_service_v1
with (security_invoker = true)
as
select
  s.organization_id,
  s.id as source_id,
  s.enabled,
  (
    select r.status
    from integration.sync_runs r
    where r.organization_id = s.organization_id
      and r.source_id = s.id
    order by r.created_at desc
    limit 1
  ) as latest_run_status,
  (
    select count(*)
    from integration.laudus_products p
    where p.organization_id = s.organization_id
  )::bigint as products,
  (
    select count(*)
    from integration.laudus_products p
    where p.organization_id = s.organization_id
      and p.inventory_eligibility = 'eligible'
  )::bigint as eligible_products,
  (
    select count(*)
    from integration.laudus_products p
    where p.organization_id = s.organization_id
      and p.inventory_eligibility = 'eligible'
      and p.canonical_product_id is not null
  )::bigint as linked_eligible_products,
  (
    select count(*)
    from integration.laudus_product_stock st
    where st.organization_id = s.organization_id
  )::bigint as stock_rows,
  (
    select max(st.synced_at)
    from integration.laudus_product_stock st
    where st.organization_id = s.organization_id
  ) as latest_stock_sync,
  (
    select count(*)
    from integration.laudus_warehouses w
    where w.organization_id = s.organization_id
  )::bigint as warehouses,
  (
    select count(*)
    from integration.laudus_warehouses w
    where w.organization_id = s.organization_id
      and w.external_id in ('001', '002', '003', '004')
  )::bigint as physical_warehouses,
  (
    select count(*)
    from integration.laudus_warehouses w
    where w.organization_id = s.organization_id
      and w.external_id in ('001', '002', '003', '004')
      and w.motil_warehouse_id is not null
      and w.reconciliation_status = 'matched'
  )::bigint as mapped_physical_warehouses,
  (
    (
      select count(*)
      from integration.reconciliation_items ri
      where ri.organization_id = s.organization_id
        and ri.source_id = s.id
        and ri.entity_type in ('product', 'stock')
        and ri.resolution_status in ('pending', 'conflict', 'new_candidate')
    )
    +
    (
      select count(*)
      from integration.laudus_warehouses w
      where w.organization_id = s.organization_id
        and w.reconciliation_status in ('new_candidate', 'conflict')
    )
  )::bigint as open_reconciliation
from integration.external_sources s
where s.source_key = 'laudus';

revoke all on public.laudus_inventory_readiness_service_v1 from public, anon, authenticated;
grant select on public.laudus_inventory_readiness_service_v1 to service_role;

comment on view public.laudus_inventory_reconciliation_service_v1 is
  'Server-only read projection comparing resolved eligible Laudus stock evidence with the current MOTIL Bodega quantity by normalized SKU. Never auto-applies differences.';

comment on view public.laudus_inventory_reconciliation_summary_service_v1 is
  'Server-only aggregate of Laudus versus MOTIL Bodega reconciliation states.';

comment on view public.laudus_inventory_readiness_service_v1 is
  'Server-only readiness summary for Laudus inventory evidence, replacing direct PostgREST access to the private integration schema.';
