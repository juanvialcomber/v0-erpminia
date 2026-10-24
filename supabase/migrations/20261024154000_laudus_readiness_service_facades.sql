-- Complete service-role-only facades for Laudus readiness and reconciliation.
-- Keeps canonical/integration schemas private from Data API clients.

create or replace view public.canonical_products_service_v1
with (security_invoker = true)
as
select id,organization_id,product_code,unit
from canonical.products;

create or replace view public.canonical_suppliers_service_v1
with (security_invoker = true)
as
select id,organization_id,tax_id,legal_name
from canonical.suppliers;

create or replace view public.canonical_purchase_orders_service_v1
with (security_invoker = true)
as
select id,organization_id,canonical_supplier_id,cost_center_code,total_amount,currency
from canonical.purchase_orders;

create or replace view public.canonical_purchase_order_lines_service_v1
with (security_invoker = true)
as
select
  id,organization_id,canonical_product_id,quantity,unit_cost,unit,
  quantity_received,cost_center_code,asset_reference
from canonical.purchase_order_lines;

create or replace view public.laudus_warehouses_service_v1
with (security_invoker = true)
as
select organization_id,external_id,laudus_warehouse_id,name
from integration.laudus_warehouses;

create or replace view public.laudus_external_entity_links_service_v1
with (security_invoker = true)
as
select
  id,
  organization_id,
  source_id,
  entity_type,
  resolution_status as link_status
from integration.reconciliation_items
where resolution_status = 'matched';

create or replace view public.purchase_order_reconciliation_preview_service_v1
with (security_invoker = true)
as
select
  organization_id,purchase_order_id,order_number,order_date,supplier_name,
  supplier_resolution_status,cost_center_resolution_status,raw_line_cost_center,
  parsed_line_cost_center_code,distinct_line_cost_centers,total_amount,currency,
  fully_resolvable
from integration.purchase_order_reconciliation_preview_v1;

create or replace view public.supplier_resolution_queue_service_v1
with (security_invoker = true)
as
select
  organization_id,supplier_name_key,display_name,purchase_order_count,
  first_order_date,last_order_date,currency_count,single_currency,
  total_amount_single_currency
from integration.supplier_resolution_queue_v1;

revoke all on public.canonical_products_service_v1 from public,anon,authenticated;
revoke all on public.canonical_suppliers_service_v1 from public,anon,authenticated;
revoke all on public.canonical_purchase_orders_service_v1 from public,anon,authenticated;
revoke all on public.canonical_purchase_order_lines_service_v1 from public,anon,authenticated;
revoke all on public.laudus_warehouses_service_v1 from public,anon,authenticated;
revoke all on public.laudus_external_entity_links_service_v1 from public,anon,authenticated;
revoke all on public.purchase_order_reconciliation_preview_service_v1 from public,anon,authenticated;
revoke all on public.supplier_resolution_queue_service_v1 from public,anon,authenticated;

grant select on public.canonical_products_service_v1 to service_role;
grant select on public.canonical_suppliers_service_v1 to service_role;
grant select on public.canonical_purchase_orders_service_v1 to service_role;
grant select on public.canonical_purchase_order_lines_service_v1 to service_role;
grant select on public.laudus_warehouses_service_v1 to service_role;
grant select on public.laudus_external_entity_links_service_v1 to service_role;
grant select on public.purchase_order_reconciliation_preview_service_v1 to service_role;
grant select on public.supplier_resolution_queue_service_v1 to service_role;
