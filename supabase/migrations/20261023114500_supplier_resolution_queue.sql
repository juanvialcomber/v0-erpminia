-- Prioritized unresolved historical supplier names for human review or future Laudus reconciliation.
-- Read-only view. No supplier is created or modified.

create or replace view integration.supplier_resolution_queue_v1 as
select
  organization_id,
  upper(regexp_replace(coalesce(nullif(trim(supplier_name),''),''),'\s+',' ','g')) as supplier_name_key,
  min(supplier_name) as display_name,
  count(*) as purchase_order_count,
  min(order_date) as first_order_date,
  max(order_date) as last_order_date,
  count(distinct currency) filter (where nullif(trim(currency),'') is not null) as currency_count,
  case
    when count(distinct currency) filter (where nullif(trim(currency),'') is not null) = 1
      then min(currency) filter (where nullif(trim(currency),'') is not null)
    else null
  end as single_currency,
  case
    when count(distinct currency) filter (where nullif(trim(currency),'') is not null) = 1
      then sum(total_amount)
    else null
  end as total_amount_single_currency
from integration.purchase_order_reconciliation_preview_v1
where supplier_resolution_status = 'unresolved'
  and nullif(trim(supplier_name),'') is not null
group by
  organization_id,
  upper(regexp_replace(coalesce(nullif(trim(supplier_name),''),''),'\s+',' ','g'));

revoke all on integration.supplier_resolution_queue_v1 from public, anon, authenticated;
grant select on integration.supplier_resolution_queue_v1 to service_role;

comment on view integration.supplier_resolution_queue_v1 is
  'Prioritized unresolved historical supplier-name queue. Read-only; supports human review and future exact Laudus identity reconciliation.';
