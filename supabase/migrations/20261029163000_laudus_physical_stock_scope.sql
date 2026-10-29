-- Keep effective Laudus inventory scoped to physical warehouses only.
-- Virtual/service locations remain preserved as source evidence but must not
-- contribute to MOTIL Bodega quantities or reconciliation freshness.

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
    coalesce(sum(s.stock) filter (
      where s.warehouse_external_id in ('001','002','003','004')
    ), 0)::numeric as laudus_stock,
    count(s.id) filter (
      where s.warehouse_external_id in ('001','002','003','004')
    )::bigint as stock_position_count,
    count(s.id) filter (
      where s.warehouse_external_id in ('001','002','003','004')
        and s.stock <> 0
    )::bigint as nonzero_stock_position_count,
    max(s.source_date_to) filter (
      where s.warehouse_external_id in ('001','002','003','004')
    ) as source_date_to,
    max(s.synced_at) filter (
      where s.warehouse_external_id in ('001','002','003','004')
    ) as laudus_synced_at
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
      and st.warehouse_external_id in ('001','002','003','004')
  )::bigint as stock_rows,
  (
    select max(st.synced_at)
    from integration.laudus_product_stock st
    where st.organization_id = s.organization_id
      and st.warehouse_external_id in ('001','002','003','004')
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
      and w.external_id in ('001','002','003','004')
  )::bigint as physical_warehouses,
  (
    select count(*)
    from integration.laudus_warehouses w
    where w.organization_id = s.organization_id
      and w.external_id in ('001','002','003','004')
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
        and (
          ri.entity_type <> 'product'
          or not exists (
            select 1
            from integration.laudus_products lp
            where lp.organization_id = ri.organization_id
              and lp.source_id = ri.source_id
              and lp.external_id = ri.external_id
              and lp.reconciliation_status = 'ignored'
          )
        )
    )
    +
    (
      select count(*)
      from integration.laudus_warehouses w
      where w.organization_id = s.organization_id
        and w.external_id in ('001','002','003','004')
        and w.reconciliation_status in ('new_candidate', 'conflict')
    )
  )::bigint as open_reconciliation
from integration.external_sources s
where s.source_key = 'laudus';

revoke all on public.laudus_inventory_readiness_service_v1 from public, anon, authenticated;
grant select on public.laudus_inventory_readiness_service_v1 to service_role;

comment on view public.laudus_inventory_reconciliation_service_v1 is
  'Server-only read projection comparing resolved eligible Laudus stock from physical warehouses 001-004 with current MOTIL Bodega quantity. Virtual/service warehouse evidence remains staged but excluded from effective stock.';

comment on view public.laudus_inventory_reconciliation_summary_service_v1 is
  'Server-only aggregate of physical Laudus versus MOTIL Bodega reconciliation states.';

comment on view public.laudus_inventory_readiness_service_v1 is
  'Server-only Laudus inventory readiness. Stock freshness and open reconciliation ignore virtual warehouses and already-terminal ignored products.';
