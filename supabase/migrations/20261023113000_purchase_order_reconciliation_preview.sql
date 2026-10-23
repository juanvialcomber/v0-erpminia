-- Read-only reconciliation preview for historical purchase orders.
-- No canonical data is mutated.

create or replace view integration.purchase_order_reconciliation_preview_v1 as
with supplier_name_map as (
  select
    organization_id,
    name_key,
    min(id::text)::uuid as supplier_id,
    count(distinct id) as supplier_count
  from (
    select
      organization_id,
      id,
      upper(regexp_replace(coalesce(nullif(trim(legal_name),''),''),'\s+',' ','g')) as name_key
    from canonical.suppliers
    union all
    select
      organization_id,
      id,
      upper(regexp_replace(coalesce(nullif(trim(trade_name),''),''),'\s+',' ','g')) as name_key
    from canonical.suppliers
  ) x
  where name_key <> ''
  group by organization_id, name_key
),
line_cost_center as (
  select
    purchase_order_id,
    organization_id,
    count(distinct nullif(trim(cost_center_code),'')) filter (
      where nullif(trim(cost_center_code),'') is not null
    ) as distinct_cost_centers,
    min(nullif(trim(cost_center_code),'')) filter (
      where nullif(trim(cost_center_code),'') is not null
    ) as consensus_cost_center
  from canonical.purchase_order_lines
  group by purchase_order_id, organization_id
)
select
  po.organization_id,
  po.id as purchase_order_id,
  po.order_number,
  po.order_date,
  po.supplier_name,
  po.supplier_tax_id,
  po.canonical_supplier_id,
  po.cost_center_code,
  po.total_amount,
  po.currency,
  snm.supplier_id as proposed_supplier_id,
  coalesce(snm.supplier_count, 0) as supplier_name_match_count,
  case
    when po.canonical_supplier_id is not null then 'already_linked'
    when snm.supplier_id is not null and snm.supplier_count = 1 then 'exact_unique_name'
    when coalesce(snm.supplier_count,0) > 1 then 'conflict'
    else 'unresolved'
  end as supplier_resolution_status,
  lcc.consensus_cost_center as proposed_cost_center_code,
  coalesce(lcc.distinct_cost_centers, 0) as distinct_line_cost_centers,
  case
    when nullif(trim(po.cost_center_code),'') is not null then 'already_linked'
    when lcc.distinct_cost_centers = 1 and lcc.consensus_cost_center is not null then 'line_consensus'
    when coalesce(lcc.distinct_cost_centers,0) > 1 then 'conflict'
    else 'unresolved'
  end as cost_center_resolution_status,
  (
    (po.canonical_supplier_id is not null or (snm.supplier_id is not null and snm.supplier_count = 1))
    and
    (nullif(trim(po.cost_center_code),'') is not null or (lcc.distinct_cost_centers = 1 and lcc.consensus_cost_center is not null))
  ) as fully_resolvable,
  now() as evaluated_at
from canonical.purchase_orders po
left join supplier_name_map snm
  on snm.organization_id = po.organization_id
 and snm.name_key = upper(regexp_replace(coalesce(nullif(trim(po.supplier_name),''),''),'\s+',' ','g'))
left join line_cost_center lcc
  on lcc.purchase_order_id = po.id
 and lcc.organization_id = po.organization_id;

revoke all on integration.purchase_order_reconciliation_preview_v1 from public, anon, authenticated;
grant select on integration.purchase_order_reconciliation_preview_v1 to service_role;

comment on view integration.purchase_order_reconciliation_preview_v1 is
  'Read-only historical purchase-order reconciliation preview. Supplier links use exact unique normalized names; cost centers use unanimous line consensus. No canonical mutation.';
