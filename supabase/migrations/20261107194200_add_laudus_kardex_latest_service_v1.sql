-- Safe public service projection for the latest staged Laudus Kardex movement.
-- Keeps Bodega readiness outside the private integration schema and remains read-only.

create or replace view public.laudus_product_kardex_latest_service_v1
with (security_invoker = true)
as
select distinct on (k.organization_id,k.product_external_id)
  k.organization_id,
  k.product_external_id,
  k.movement_date,
  k.movement_type,
  k.description,
  k.quantity,
  k.resulting_stock,
  k.synced_at
from integration.laudus_product_kardex k
order by
  k.organization_id,
  k.product_external_id,
  k.movement_date desc nulls last,
  k.synced_at desc,
  k.id desc;

revoke all on public.laudus_product_kardex_latest_service_v1 from public, anon, authenticated;
grant select on public.laudus_product_kardex_latest_service_v1 to service_role;
