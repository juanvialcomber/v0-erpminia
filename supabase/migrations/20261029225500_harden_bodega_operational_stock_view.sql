-- Harden Bodega operational stock projection.
-- Runtime access is server-side through getSupabaseServerClient (service_role).

revoke all on public.bodega_inventory_operational_service_v1
  from public, anon, authenticated, service_role;
grant select on public.bodega_inventory_operational_service_v1
  to service_role;
