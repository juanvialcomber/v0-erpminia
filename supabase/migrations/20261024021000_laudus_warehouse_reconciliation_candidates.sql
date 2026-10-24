-- Read-only warehouse mapping evidence for Laudus -> MOTIL inventory.
-- Produces candidates only; does not write motil_warehouse_id or alter stock.

create or replace function public.motil_get_laudus_warehouse_reconciliation_candidates(
  p_organization_id uuid
)
returns table (
  laudus_warehouse_external_id text,
  laudus_warehouse_name text,
  motil_warehouse_id uuid,
  motil_warehouse_name text,
  comparable_products bigint,
  both_nonzero bigint,
  exact_nonzero bigint,
  exact_nonzero_pct numeric,
  evidence_level text
)
language sql
security definer
set search_path = public, integration, pg_temp
as $function$
with mapped as (
  select external_id, canonical_product_id
  from integration.laudus_products
  where organization_id = p_organization_id
    and reconciliation_status = 'matched'
    and canonical_product_id is not null
),
motil as (
  select ci.id, ci.quantity
  from public.canonical_inventory_current ci
  where ci.organization_id = p_organization_id
),
per_wh as (
  select s.warehouse_external_id,
         s.product_external_id,
         sum(s.stock) as laudus_qty
  from integration.laudus_product_stock s
  where s.organization_id = p_organization_id
  group by s.warehouse_external_id, s.product_external_id
),
comp as (
  select pw.warehouse_external_id,
         pw.product_external_id,
         pw.laudus_qty,
         m.canonical_product_id,
         motil.quantity as motil_qty
  from per_wh pw
  join mapped m on m.external_id = pw.product_external_id
  left join motil on motil.id = m.canonical_product_id
),
target_warehouse as (
  select w.id, w.name
  from public.warehouses w
  where w.organization_id = p_organization_id
    and w.status = 'active'
  order by w.created_at
  limit 1
)
select
  lw.external_id,
  lw.name,
  tw.id,
  tw.name,
  count(*) filter (where c.motil_qty is not null) as comparable_products,
  count(*) filter (where c.laudus_qty <> 0 and c.motil_qty <> 0) as both_nonzero,
  count(*) filter (where c.laudus_qty = c.motil_qty and c.laudus_qty <> 0) as exact_nonzero,
  round(
    100.0 * count(*) filter (where c.laudus_qty = c.motil_qty and c.laudus_qty <> 0)
    / nullif(count(*) filter (where c.laudus_qty <> 0 and c.motil_qty is not null), 0),
    2
  ) as exact_nonzero_pct,
  case
    when count(*) filter (where c.laudus_qty <> 0 and c.motil_qty <> 0) >= 1000
      and (
        100.0 * count(*) filter (where c.laudus_qty = c.motil_qty and c.laudus_qty <> 0)
        / nullif(count(*) filter (where c.laudus_qty <> 0 and c.motil_qty is not null), 0)
      ) >= 60
      then 'strong_candidate'
    when count(*) filter (where c.laudus_qty <> 0 and c.motil_qty <> 0) >= 100
      and (
        100.0 * count(*) filter (where c.laudus_qty = c.motil_qty and c.laudus_qty <> 0)
        / nullif(count(*) filter (where c.laudus_qty <> 0 and c.motil_qty is not null), 0)
      ) >= 25
      then 'candidate'
    else 'insufficient_evidence'
  end as evidence_level
from integration.laudus_warehouses lw
cross join target_warehouse tw
left join comp c on c.warehouse_external_id = lw.external_id
where lw.organization_id = p_organization_id
group by lw.external_id, lw.name, tw.id, tw.name
order by
  case
    when count(*) filter (where c.laudus_qty <> 0 and c.motil_qty <> 0) >= 1000
      and (
        100.0 * count(*) filter (where c.laudus_qty = c.motil_qty and c.laudus_qty <> 0)
        / nullif(count(*) filter (where c.laudus_qty <> 0 and c.motil_qty is not null), 0)
      ) >= 60 then 1
    when count(*) filter (where c.laudus_qty <> 0 and c.motil_qty <> 0) >= 100
      and (
        100.0 * count(*) filter (where c.laudus_qty = c.motil_qty and c.laudus_qty <> 0)
        / nullif(count(*) filter (where c.laudus_qty <> 0 and c.motil_qty is not null), 0)
      ) >= 25 then 2
    else 3
  end,
  exact_nonzero_pct desc nulls last,
  lw.external_id;
$function$;

revoke all on function public.motil_get_laudus_warehouse_reconciliation_candidates(uuid)
  from public, anon, authenticated;
grant execute on function public.motil_get_laudus_warehouse_reconciliation_candidates(uuid)
  to service_role;

comment on function public.motil_get_laudus_warehouse_reconciliation_candidates(uuid)
  is 'Read-only evidence ranking for possible Laudus-to-MOTIL warehouse mappings. Never confirms or writes a mapping automatically.';
