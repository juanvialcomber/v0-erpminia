create or replace view public.laudus_purchase_invoice_lines_service_v1
with (security_invoker = true)
as
select
  organization_id,
  invoice_external_id,
  product_external_id,
  sku,
  description,
  quantity,
  unit_price,
  line_total,
  unit,
  synced_at
from integration.laudus_purchase_invoice_lines;

create or replace view public.laudus_purchase_orders_service_v1
with (security_invoker = true)
as
select
  organization_id,
  external_id,
  order_number,
  supplier_external_id,
  supplier_name,
  issued_date,
  total_amount,
  currency,
  status,
  synced_at
from integration.laudus_purchase_orders;

create or replace view public.laudus_purchase_order_lines_service_v1
with (security_invoker = true)
as
select
  organization_id,
  purchase_order_external_id,
  product_external_id,
  sku,
  description,
  quantity,
  unit_price,
  line_total,
  unit,
  synced_at
from integration.laudus_purchase_order_lines;

revoke all on public.laudus_purchase_invoice_lines_service_v1 from public, anon, authenticated;
revoke all on public.laudus_purchase_orders_service_v1 from public, anon, authenticated;
revoke all on public.laudus_purchase_order_lines_service_v1 from public, anon, authenticated;

grant select on public.laudus_purchase_invoice_lines_service_v1 to service_role;
grant select on public.laudus_purchase_orders_service_v1 to service_role;
grant select on public.laudus_purchase_order_lines_service_v1 to service_role;
