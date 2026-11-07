-- Mejora la conciliacion de centros de costo de OC usando MOTIL como capa operacional canonica.
-- Conserva los codigos hoja de Laudus como evidencia, pero permite heredar al padre activo de MOTIL
-- cuando el centro hoja esta explicitamente ignorado y todas las lineas convergen al mismo centro operacional.

create or replace view integration.purchase_order_reconciliation_preview_v1 as
with supplier_name_map as (
  select x.organization_id,
         x.name_key,
         (min(x.id::text))::uuid as supplier_id,
         count(distinct x.id) as supplier_count
  from (
    select organization_id,id,
           upper(regexp_replace(coalesce(nullif(btrim(legal_name),''),''),'\s+',' ','g')) as name_key
    from canonical.suppliers
    union all
    select organization_id,id,
           upper(regexp_replace(coalesce(nullif(btrim(trade_name),''),''),'\s+',' ','g')) as name_key
    from canonical.suppliers
  ) x
  where x.name_key <> ''
  group by x.organization_id,x.name_key
),
lineas as (
  select
    pol.organization_id,
    pol.purchase_order_id,
    nullif(btrim(pol.cost_center_code),'') as raw_code,
    (regexp_match(nullif(btrim(pol.cost_center_code),''), '^([0-9]+(?:-[0-9]+)*)'))[1] as parsed_code
  from canonical.purchase_order_lines pol
),
lineas_resueltas as (
  select
    l.organization_id,
    l.purchase_order_id,
    l.raw_code,
    l.parsed_code,
    case
      when cc_exact.id is not null and cc_exact.is_active then cc_exact.cost_center_code
      when cc_exact.id is null
       and lc.reconciliation_status='ignored'
       and cc_parent.id is not null
       and cc_parent.is_active then cc_parent.cost_center_code
      else null
    end as operational_code
  from lineas l
  left join canonical.cost_centers cc_exact
    on cc_exact.organization_id=l.organization_id
   and upper(btrim(cc_exact.cost_center_code))=upper(btrim(l.parsed_code))
  left join public.laudus_cost_centers_service_v1 lc
    on lc.organization_id=l.organization_id
   and upper(btrim(coalesce(lc.operational_code,'')))=upper(btrim(l.parsed_code))
  left join canonical.cost_centers cc_parent
    on cc_parent.organization_id=l.organization_id
   and upper(btrim(cc_parent.cost_center_code))=
       upper(btrim(regexp_replace(l.parsed_code, '-[^-]+$', '')))
),
line_cost_center as (
  select
    organization_id,
    purchase_order_id,
    count(distinct raw_code) filter (where raw_code is not null) as distinct_cost_centers,
    min(raw_code) filter (where raw_code is not null) as consensus_raw,
    count(*) filter (where parsed_code is not null and operational_code is null) as unresolved_line_count,
    count(distinct operational_code) filter (where operational_code is not null) as distinct_operational_centers,
    min(operational_code) filter (where operational_code is not null) as consensus_operational_code
  from lineas_resueltas
  group by organization_id,purchase_order_id
),
parsed_line_cost_center as (
  select
    purchase_order_id,
    organization_id,
    distinct_cost_centers,
    consensus_raw,
    (regexp_match(consensus_raw, '^([0-9]+(?:-[0-9]+)*)'))[1] as parsed_code,
    unresolved_line_count,
    distinct_operational_centers,
    consensus_operational_code
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
  coalesce(snm.supplier_count,0::bigint) as supplier_name_match_count,
  case
    when po.canonical_supplier_id is not null then 'already_linked'
    when snm.supplier_id is not null and snm.supplier_count=1 then 'exact_unique_name'
    when coalesce(snm.supplier_count,0)>1 then 'conflict'
    else 'unresolved'
  end as supplier_resolution_status,
  plc.consensus_raw as raw_line_cost_center,
  plc.parsed_code as parsed_line_cost_center_code,
  plc.consensus_operational_code as proposed_cost_center_code,
  coalesce(plc.distinct_cost_centers,0::bigint) as distinct_line_cost_centers,
  case
    when nullif(btrim(po.cost_center_code),'') is not null then 'already_linked'
    when plc.unresolved_line_count=0
     and plc.distinct_operational_centers=1
     and plc.consensus_operational_code is not null then 'line_consensus'
    when plc.unresolved_line_count=0
     and coalesce(plc.distinct_operational_centers,0)>1 then 'conflict'
    when coalesce(plc.distinct_cost_centers,0)>0 then 'unresolved'
    else 'unresolved'
  end as cost_center_resolution_status,
  (
    (po.canonical_supplier_id is not null or (snm.supplier_id is not null and snm.supplier_count=1))
    and
    (
      nullif(btrim(po.cost_center_code),'') is not null
      or (
        plc.unresolved_line_count=0
        and plc.distinct_operational_centers=1
        and plc.consensus_operational_code is not null
      )
    )
  ) as fully_resolvable,
  now() as evaluated_at
from canonical.purchase_orders po
left join supplier_name_map snm
  on snm.organization_id=po.organization_id
 and snm.name_key=upper(regexp_replace(coalesce(nullif(btrim(po.supplier_name),''),''),'\s+',' ','g'))
left join parsed_line_cost_center plc
  on plc.purchase_order_id=po.id
 and plc.organization_id=po.organization_id;

create or replace view public.purchase_order_reconciliation_preview_service_v1 as
select
  organization_id,
  purchase_order_id,
  order_number,
  order_date,
  supplier_name,
  supplier_resolution_status,
  cost_center_resolution_status,
  raw_line_cost_center,
  parsed_line_cost_center_code,
  distinct_line_cost_centers,
  total_amount,
  currency,
  fully_resolvable
from integration.purchase_order_reconciliation_preview_v1;
