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
    ) as consensus_raw
  from canonical.purchase_order_lines
  group by purchase_order_id, organization_id
),
parsed_line_cost_center as (
  select
    purchase_order_id,
    organization_id,
    distinct_cost_centers,
    consensus_raw,
    (regexp_match(consensus_raw, '^([0-9]+(?:-[0-9]+)*)'))[1] as parsed_code
  from line_cost_center
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
  plc.consensus_raw as raw_line_cost_center,
  plc.parsed_code as parsed_line_cost_center_code,
  cc.cost_center_code as proposed_cost_center_code,
  coalesce(plc.distinct_cost_centers, 0) as distinct_line_cost_centers,
  case
    when nullif(trim(po.cost_center_code),'') is not null then 'already_linked'
    when plc.distinct_cost_centers = 1 and plc.parsed_code is not null and cc.id is not null then 'line_consensus'
    when plc.distinct_cost_centers = 1 and plc.parsed_code is not null and cc.id is null then 'unknown_code'
    when coalesce(plc.distinct_cost_centers,0) > 1 then 'conflict'
    else 'unresolved'
  end as cost_center_resolution_status,
  (
    (po.canonical_supplier_id is not null or (snm.supplier_id is not null and snm.supplier_count = 1))
    and
    (
      nullif(trim(po.cost_center_code),'') is not null
      or (plc.distinct_cost_centers = 1 and plc.parsed_code is not null and cc.id is not null)
    )
  ) as fully_resolvable,
  now() as evaluated_at
from canonical.purchase_orders po
left join supplier_name_map snm
  on snm.organization_id = po.organization_id
 and snm.name_key = upper(regexp_replace(coalesce(nullif(trim(po.supplier_name),''),''),'\s+',' ','g'))
left join parsed_line_cost_center plc
  on plc.purchase_order_id = po.id
 and plc.organization_id = po.organization_id
left join canonical.cost_centers cc
  on cc.organization_id = po.organization_id
 and upper(trim(cc.cost_center_code)) = upper(trim(plc.parsed_code));

revoke all on integration.purchase_order_reconciliation_preview_v1 from public, anon, authenticated;
grant select on integration.purchase_order_reconciliation_preview_v1 to service_role;

comment on view integration.purchase_order_reconciliation_preview_v1 is
  'Read-only historical purchase-order reconciliation preview. Supplier links use exact unique normalized names. Cost centers require unanimous line consensus, deterministic prefix parsing, and an exact canonical cost-center match. No canonical mutation.';
