-- Expand bounded Kardex recovery to warehouse-only stock imbalances as well as global deficits.
-- Read-only candidate projection: no stock, canonical inventory, or Laudus mutation.

create or replace view public.laudus_kardex_recovery_candidates_service_v1
with (security_invoker = true)
as
with candidates as (
  select
    n.organization_id,
    n.product_external_id,
    n.sku,
    100 + least(100, abs(coalesce(n.total_laudus_stock, 0)))::int as priority_score,
    'global_negative_stock'::text as reason,
    n.synced_at
  from public.laudus_negative_stock_positions_service_v1 n

  union all

  select
    d.organization_id,
    p.external_id as product_external_id,
    p.sku,
    50 as priority_score,
    'warehouse_transfer_imbalance'::text as reason,
    greatest(coalesce(p.synced_at, d.updated_at), d.updated_at) as synced_at
  from public.data_reconciliation_reviews d
  join integration.laudus_products p
    on p.organization_id=d.organization_id
   and upper(p.sku) = upper(split_part(d.issue_key, ':', 2))
  where d.status='open'
    and d.issue_type='warehouse_transfer_imbalance_global_positive'
), ranked as (
  select c.*,
         row_number() over (
           partition by c.organization_id,c.product_external_id
           order by c.priority_score desc,c.synced_at desc nulls last
         ) as rn
  from candidates c
)
select organization_id,product_external_id,sku,priority_score,reason,synced_at
from ranked
where rn=1;

revoke all on public.laudus_kardex_recovery_candidates_service_v1 from public, anon, authenticated;
grant select on public.laudus_kardex_recovery_candidates_service_v1 to service_role;
