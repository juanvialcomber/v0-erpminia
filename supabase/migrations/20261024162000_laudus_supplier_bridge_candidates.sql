-- Precomputed, read-only supplier bridge for historical purchase orders.
-- Uses exact supplier-name identity plus an already tax-id-verified Laudus -> canonical supplier link.
-- Never mutates canonical purchase orders or suppliers.

create materialized view if not exists integration.laudus_supplier_bridge_candidates_v1 as
with queue as (
  select
    organization_id,
    supplier_name_key,
    display_name,
    purchase_order_count,
    first_order_date,
    last_order_date,
    currency_count,
    single_currency,
    total_amount_single_currency
  from integration.supplier_resolution_queue_v1
),
verified_laudus as (
  select
    ls.organization_id,
    ls.id as laudus_supplier_row_id,
    ls.external_id as laudus_supplier_external_id,
    ls.canonical_supplier_id,
    ls.tax_id as laudus_tax_id,
    cs.tax_id as canonical_tax_id,
    cs.legal_name as canonical_supplier_name,
    upper(regexp_replace(coalesce(nullif(trim(ls.name),''),''),'\s+',' ','g')) as name_key,
    upper(regexp_replace(coalesce(nullif(trim(ls.legal_name),''),''),'\s+',' ','g')) as legal_key
  from integration.laudus_suppliers ls
  join canonical.suppliers cs
    on cs.organization_id = ls.organization_id
   and cs.id = ls.canonical_supplier_id
   and regexp_replace(lower(coalesce(cs.tax_id,'')), '[^0-9k]', '', 'g')
       = regexp_replace(lower(coalesce(ls.tax_id,'')), '[^0-9k]', '', 'g')
  where ls.canonical_supplier_id is not null
    and regexp_replace(lower(coalesce(ls.tax_id,'')), '[^0-9k]', '', 'g') <> ''
),
candidate_set as (
  select
    q.organization_id,
    q.supplier_name_key,
    q.display_name,
    q.purchase_order_count,
    q.first_order_date,
    q.last_order_date,
    q.currency_count,
    q.single_currency,
    q.total_amount_single_currency,
    count(distinct v.canonical_supplier_id) as candidate_count,
    min(v.canonical_supplier_id::text)::uuid as canonical_supplier_id,
    min(v.canonical_supplier_name) as canonical_supplier_name,
    min(v.canonical_tax_id) as canonical_supplier_tax_id,
    min(v.laudus_supplier_external_id) as laudus_supplier_external_id
  from queue q
  left join verified_laudus v
    on v.organization_id = q.organization_id
   and q.supplier_name_key in (v.name_key, v.legal_key)
  group by
    q.organization_id,
    q.supplier_name_key,
    q.display_name,
    q.purchase_order_count,
    q.first_order_date,
    q.last_order_date,
    q.currency_count,
    q.single_currency,
    q.total_amount_single_currency
)
select
  organization_id,
  supplier_name_key,
  display_name,
  purchase_order_count,
  first_order_date,
  last_order_date,
  currency_count,
  single_currency,
  total_amount_single_currency,
  candidate_count,
  case when candidate_count = 1 then canonical_supplier_id else null end as proposed_canonical_supplier_id,
  case when candidate_count = 1 then canonical_supplier_name else null end as proposed_canonical_supplier_name,
  case when candidate_count = 1 then canonical_supplier_tax_id else null end as proposed_canonical_supplier_tax_id,
  case when candidate_count = 1 then laudus_supplier_external_id else null end as laudus_supplier_external_id,
  case
    when supplier_name_key = 'NULA' then 'source_placeholder'
    when candidate_count = 1 then 'tax_verified_exact'
    when candidate_count > 1 then 'ambiguous'
    else 'unresolved'
  end as resolution_status,
  case
    when supplier_name_key = 'NULA' then 'legacy_zero_value_placeholder'
    when candidate_count = 1 then 'exact_name_to_laudus_plus_exact_tax_id_to_canonical'
    when candidate_count > 1 then 'multiple_tax_verified_canonical_candidates'
    else 'no_tax_verified_laudus_candidate'
  end as resolution_method,
  now() as evaluated_at
from candidate_set;

create unique index if not exists laudus_supplier_bridge_candidates_org_name_uidx
  on integration.laudus_supplier_bridge_candidates_v1(organization_id,supplier_name_key);

create index if not exists laudus_supplier_bridge_candidates_org_status_idx
  on integration.laudus_supplier_bridge_candidates_v1(organization_id,resolution_status,purchase_order_count desc);

revoke all on integration.laudus_supplier_bridge_candidates_v1 from public,anon,authenticated;
grant select on integration.laudus_supplier_bridge_candidates_v1 to service_role;

create or replace view public.laudus_supplier_bridge_candidates_service_v1
with (security_invoker = true)
as
select
  organization_id,
  supplier_name_key,
  display_name,
  purchase_order_count,
  first_order_date,
  last_order_date,
  currency_count,
  single_currency,
  total_amount_single_currency,
  candidate_count,
  proposed_canonical_supplier_id,
  proposed_canonical_supplier_name,
  proposed_canonical_supplier_tax_id,
  laudus_supplier_external_id,
  resolution_status,
  resolution_method,
  evaluated_at
from integration.laudus_supplier_bridge_candidates_v1;

revoke all on public.laudus_supplier_bridge_candidates_service_v1 from public,anon,authenticated;
grant select on public.laudus_supplier_bridge_candidates_service_v1 to service_role;

create or replace function public.motil_refresh_laudus_supplier_bridge()
returns void
language plpgsql
security definer
set search_path = public,integration,canonical,pg_temp
as $function$
begin
  refresh materialized view integration.laudus_supplier_bridge_candidates_v1;
end;
$function$;

revoke all on function public.motil_refresh_laudus_supplier_bridge() from public,anon,authenticated;
grant execute on function public.motil_refresh_laudus_supplier_bridge() to service_role;

comment on materialized view integration.laudus_supplier_bridge_candidates_v1 is
  'Read-only historical supplier bridge. Exact historical supplier name -> Laudus supplier -> exact tax-id verified canonical supplier. Never mutates canonical purchase orders.';

comment on function public.motil_refresh_laudus_supplier_bridge() is
  'Refreshes the read-only Laudus supplier bridge. Service-role only; no canonical mutation.';
