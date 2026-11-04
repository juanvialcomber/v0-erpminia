-- Align historical purchase-order supplier resolution with the verified Laudus supplier bridge.
-- Read-only projection only. No canonical, Laudus or operational purchase-order rows are mutated.

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
verified_laudus as (
  select
    ls.organization_id,
    ls.canonical_supplier_id,
    upper(regexp_replace(coalesce(nullif(trim(ls.name),''),''),'\s+',' ','g')) as name_key,
    upper(regexp_replace(coalesce(nullif(trim(ls.legal_name),''),''),'\s+',' ','g')) as legal_key
  from integration.laudus_suppliers ls
  join canonical.suppliers cs
    on cs.organization_id = ls.organization_id
   and cs.id = ls.canonical_supplier_id
   and regexp_replace(lower(coalesce(cs.tax_id,'')),'[^0-9k]','','g')
       = regexp_replace(lower(coalesce(ls.tax_id,'')),'[^0-9k]','','g')
  where ls.canonical_supplier_id is not null
    and regexp_replace(lower(coalesce(ls.tax_id,'')),'[^0-9k]','','g') <> ''
),
laudus_name_map as (
  select
    organization_id,
    name_key,
    min(canonical_supplier_id::text)::uuid as supplier_id,
    count(distinct canonical_supplier_id) as supplier_count
  from (
    select organization_id, canonical_supplier_id, name_key
    from verified_laudus
    where name_key <> ''
    union all
    select organization_id, canonical_supplier_id, legal_key
    from verified_laudus
    where legal_key <> ''
  ) x
  group by organization_id, name_key
),
parsed_line_rows as (
  select
    pol.purchase_order_id,
    pol.organization_id,
    nullif(trim(pol.cost_center_code),'') as raw_code,
    (regexp_match(nullif(trim(pol.cost_center_code),''), '^([0-9]+(?:-[0-9]+)*)'))[1] as parsed_code
  from canonical.purchase_order_lines pol
),
line_cost_center as (
  select
    plr.purchase_order_id,
    plr.organization_id,
    count(distinct plr.raw_code) filter (where plr.raw_code is not null) as distinct_cost_centers,
    min(plr.raw_code) filter (where plr.raw_code is not null) as consensus_raw,
    min(plr.parsed_code) filter (where plr.parsed_code is not null) as parsed_code,
    count(*) filter (where plr.raw_code is not null and plr.parsed_code is null) as unparsed_line_cost_centers,
    count(*) filter (where plr.parsed_code is not null and cc.id is null) as unknown_line_cost_centers
  from parsed_line_rows plr
  left join canonical.cost_centers cc
    on cc.organization_id = plr.organization_id
   and upper(trim(cc.cost_center_code)) = upper(trim(plr.parsed_code))
  group by plr.purchase_order_id, plr.organization_id
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
  coalesce(
    case when snm.supplier_count = 1 then snm.supplier_id end,
    case when lnm.supplier_count = 1 then lnm.supplier_id end
  ) as proposed_supplier_id,
  greatest(coalesce(snm.supplier_count,0), coalesce(lnm.supplier_count,0)) as supplier_name_match_count,
  case
    when upper(regexp_replace(coalesce(nullif(trim(po.supplier_name),''),''),'\s+',' ','g')) = 'NULA' then 'source_placeholder'
    when po.canonical_supplier_id is not null then 'already_linked'
    when snm.supplier_id is not null and snm.supplier_count = 1 then 'exact_unique_name'
    when lnm.supplier_id is not null and lnm.supplier_count = 1 then 'tax_verified_laudus'
    when coalesce(snm.supplier_count,0) > 1 or coalesce(lnm.supplier_count,0) > 1 then 'conflict'
    else 'unresolved'
  end as supplier_resolution_status,
  plc.consensus_raw as raw_line_cost_center,
  plc.parsed_code as parsed_line_cost_center_code,
  cc.cost_center_code as proposed_cost_center_code,
  coalesce(plc.distinct_cost_centers, 0) as distinct_line_cost_centers,
  case
    when upper(regexp_replace(coalesce(nullif(trim(po.supplier_name),''),''),'\s+',' ','g')) = 'NULA'
      and coalesce(plc.distinct_cost_centers,0) = 0
      then 'source_placeholder'
    when nullif(trim(po.cost_center_code),'') is not null then 'already_linked'
    when plc.distinct_cost_centers = 1 and plc.parsed_code is not null and cc.id is not null then 'line_consensus'
    when plc.distinct_cost_centers = 1 and plc.parsed_code is not null and cc.id is null then 'unknown_code'
    when coalesce(plc.distinct_cost_centers,0) > 1
      and coalesce(plc.unparsed_line_cost_centers,0) = 0
      and coalesce(plc.unknown_line_cost_centers,0) = 0
      then 'multi_line_allocation'
    when coalesce(plc.distinct_cost_centers,0) > 1 then 'multi_line_review'
    else 'unresolved'
  end as cost_center_resolution_status,
  (
    (
      upper(regexp_replace(coalesce(nullif(trim(po.supplier_name),''),''),'\s+',' ','g')) <> 'NULA'
      and (
        po.canonical_supplier_id is not null
        or (snm.supplier_id is not null and snm.supplier_count = 1)
        or (lnm.supplier_id is not null and lnm.supplier_count = 1)
      )
    )
    and
    (
      (
        upper(regexp_replace(coalesce(nullif(trim(po.supplier_name),''),''),'\s+',' ','g')) <> 'NULA'
        and (
          nullif(trim(po.cost_center_code),'') is not null
          or (plc.distinct_cost_centers = 1 and plc.parsed_code is not null and cc.id is not null)
          or (
            plc.distinct_cost_centers > 1
            and coalesce(plc.unparsed_line_cost_centers,0) = 0
            and coalesce(plc.unknown_line_cost_centers,0) = 0
          )
        )
      )
    )
  ) as fully_resolvable,
  now() as evaluated_at
from canonical.purchase_orders po
left join supplier_name_map snm
  on snm.organization_id = po.organization_id
 and snm.name_key = upper(regexp_replace(coalesce(nullif(trim(po.supplier_name),''),''),'\s+',' ','g'))
left join laudus_name_map lnm
  on lnm.organization_id = po.organization_id
 and lnm.name_key = upper(regexp_replace(coalesce(nullif(trim(po.supplier_name),''),''),'\s+',' ','g'))
left join parsed_line_cost_center plc
  on plc.purchase_order_id = po.id
 and plc.organization_id = po.organization_id
left join canonical.cost_centers cc
  on cc.organization_id = po.organization_id
 and upper(trim(cc.cost_center_code)) = upper(trim(plc.parsed_code));

revoke all on integration.purchase_order_reconciliation_preview_v1 from public, anon, authenticated;
grant select on integration.purchase_order_reconciliation_preview_v1 to service_role;

comment on view integration.purchase_order_reconciliation_preview_v1 is
  'Read-only historical purchase-order reconciliation preview. Supplier identity uses direct canonical exact names first, then Laudus identities verified by exact tax ID. Cost centers preserve valid multi-line allocations and flag only unknown or unparseable line assignments for review. No source or canonical mutation.';
