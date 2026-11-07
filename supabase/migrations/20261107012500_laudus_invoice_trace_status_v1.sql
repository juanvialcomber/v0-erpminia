create or replace function public.motil_get_laudus_invoice_trace_status_v1(
  p_organization_id uuid,
  p_invoice_external_ids text[]
)
returns table(
  invoice_external_id text,
  status text,
  trace_count integer,
  synced_at timestamptz
)
language sql
security definer
set search_path=public,integration,pg_temp
as $$
  select s.invoice_external_id,s.status,s.trace_count,s.synced_at
  from integration.laudus_purchase_invoice_trace_sync s
  where s.organization_id=p_organization_id
    and s.invoice_external_id=any(coalesce(p_invoice_external_ids,array[]::text[]));
$$;

revoke all on function public.motil_get_laudus_invoice_trace_status_v1(uuid,text[]) from public,anon,authenticated;
grant execute on function public.motil_get_laudus_invoice_trace_status_v1(uuid,text[]) to service_role;
