-- Service-role-only invoice staging bounds for Laudus rehydrate jobs.
create or replace function public.motil_get_laudus_invoice_staging_bounds(
  p_organization_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, integration, pg_temp
as $function$
select jsonb_build_object(
  'first_issued_date', min(issued_date),
  'last_issued_date', max(issued_date),
  'invoice_count', count(*)
)
from integration.laudus_purchase_invoices
where organization_id = p_organization_id;
$function$;

revoke all on function public.motil_get_laudus_invoice_staging_bounds(uuid)
  from public, anon, authenticated;
grant execute on function public.motil_get_laudus_invoice_staging_bounds(uuid)
  to service_role;
