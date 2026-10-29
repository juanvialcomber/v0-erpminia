-- Safe public service projections for server-side Laudus finance loaders.
-- The integration schema remains private; only service_role can read these views.

create or replace view public.laudus_purchase_payments_detail_service_v1 as
select
  id,
  organization_id,
  external_id,
  issued_date,
  due_date,
  document,
  deposited,
  bank,
  notes,
  source_payload,
  synced_at
from integration.laudus_purchase_payments;

create or replace view public.laudus_cost_centers_service_v1 as
select
  id,
  organization_id,
  external_id,
  cost_center_code,
  name,
  full_path,
  discontinued,
  canonical_cost_center_id,
  reconciliation_status,
  synced_at
from integration.laudus_cost_centers;

create or replace view public.laudus_fixed_assets_service_v1 as
select
  id,
  organization_id,
  external_id,
  name,
  acquisition_date,
  acquisition_cost,
  useful_life,
  canonical_asset_id,
  reconciliation_status,
  synced_at
from integration.laudus_fixed_assets;

create or replace view public.laudus_suppliers_service_v1 as
select
  organization_id,
  external_id,
  name,
  legal_name
from integration.laudus_suppliers;

create or replace view public.laudus_purchase_invoice_lines_service_v1 as
select
  organization_id,
  invoice_external_id,
  product_external_id,
  sku,
  quantity,
  unit_price,
  line_total
from integration.laudus_purchase_invoice_lines;

create or replace view public.laudus_purchase_orders_service_v1 as
select
  organization_id,
  external_id,
  order_number,
  supplier_external_id,
  issued_date,
  total_amount,
  currency,
  status
from integration.laudus_purchase_orders;

create or replace view public.laudus_purchase_order_lines_service_v1 as
select
  organization_id,
  purchase_order_external_id,
  product_external_id,
  sku,
  quantity,
  unit_price,
  line_total
from integration.laudus_purchase_order_lines;

revoke all on public.laudus_purchase_payments_detail_service_v1 from anon, authenticated;
revoke all on public.laudus_cost_centers_service_v1 from anon, authenticated;
revoke all on public.laudus_fixed_assets_service_v1 from anon, authenticated;
revoke all on public.laudus_suppliers_service_v1 from anon, authenticated;
revoke all on public.laudus_purchase_invoice_lines_service_v1 from anon, authenticated;
revoke all on public.laudus_purchase_orders_service_v1 from anon, authenticated;
revoke all on public.laudus_purchase_order_lines_service_v1 from anon, authenticated;

grant select on public.laudus_purchase_payments_detail_service_v1 to service_role;
grant select on public.laudus_cost_centers_service_v1 to service_role;
grant select on public.laudus_fixed_assets_service_v1 to service_role;
grant select on public.laudus_suppliers_service_v1 to service_role;
grant select on public.laudus_purchase_invoice_lines_service_v1 to service_role;
grant select on public.laudus_purchase_orders_service_v1 to service_role;
grant select on public.laudus_purchase_order_lines_service_v1 to service_role;
