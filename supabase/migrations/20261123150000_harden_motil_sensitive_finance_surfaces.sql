-- Keep sensitive Laudus finance data and privileged RPCs behind the server-side
-- authorization layer. The application uses the service-role client only after
-- authenticating the user and checking the relevant module permission.

-- These views were created with the default SECURITY DEFINER behavior. Pin them
-- to invoker permissions and remove direct PostgREST access for anon/authenticated.
alter view public.laudus_accounts_payable_quality_v1 set (security_invoker = true);
alter view public.laudus_accounts_payable_trusted_v1 set (security_invoker = true);
alter view public.laudus_accounts_payable_trusted_90d_v1 set (security_invoker = true);
alter view public.laudus_inventory_trusted_90d_v1 set (security_invoker = true);
alter view public.laudus_area_alert_candidates_v1 set (security_invoker = true);
alter view public.laudus_area_alert_candidates_90d_v1 set (security_invoker = true);
alter view public.laudus_missing_purchase_invoice_recovery_candidates_v1 set (security_invoker = true);
alter view public.laudus_financial_chain_service_v1 set (security_invoker = true);

revoke all on table public.laudus_accounts_payable_quality_v1 from public, anon, authenticated;
revoke all on table public.laudus_accounts_payable_trusted_v1 from public, anon, authenticated;
revoke all on table public.laudus_accounts_payable_trusted_90d_v1 from public, anon, authenticated;
revoke all on table public.laudus_inventory_trusted_90d_v1 from public, anon, authenticated;
revoke all on table public.laudus_area_alert_candidates_v1 from public, anon, authenticated;
revoke all on table public.laudus_area_alert_candidates_90d_v1 from public, anon, authenticated;
revoke all on table public.laudus_missing_purchase_invoice_recovery_candidates_v1 from public, anon, authenticated;
revoke all on table public.laudus_financial_chain_service_v1 from public, anon, authenticated;

grant select on table public.laudus_accounts_payable_quality_v1 to service_role;
grant select on table public.laudus_accounts_payable_trusted_v1 to service_role;
grant select on table public.laudus_accounts_payable_trusted_90d_v1 to service_role;
grant select on table public.laudus_inventory_trusted_90d_v1 to service_role;
grant select on table public.laudus_area_alert_candidates_v1 to service_role;
grant select on table public.laudus_area_alert_candidates_90d_v1 to service_role;
grant select on table public.laudus_missing_purchase_invoice_recovery_candidates_v1 to service_role;
grant select on table public.laudus_financial_chain_service_v1 to service_role;

-- Invoice-trace RPCs expose organization-scoped Laudus records and one function
-- can replace trace rows. Application callers use service_role behind API guards.
revoke all on function public.motil_get_laudus_invoice_trace_candidates(uuid, integer) from public, anon, authenticated;
revoke all on function public.motil_ingest_laudus_invoice_traces(uuid, text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.motil_laudus_finance_review_queue(uuid, integer) from public, anon, authenticated;
revoke all on function public.motil_laudus_invoice_trace_coverage(uuid) from public, anon, authenticated;
revoke all on function public.motil_laudus_supplier_intelligence(uuid, uuid) from public, anon, authenticated;

grant execute on function public.motil_get_laudus_invoice_trace_candidates(uuid, integer) to service_role;
grant execute on function public.motil_ingest_laudus_invoice_traces(uuid, text, bigint, jsonb) to service_role;
grant execute on function public.motil_laudus_finance_review_queue(uuid, integer) to service_role;
grant execute on function public.motil_laudus_invoice_trace_coverage(uuid) to service_role;
grant execute on function public.motil_laudus_supplier_intelligence(uuid, uuid) to service_role;

-- The following trigger functions are not application RPCs. Keep their direct
-- execute grants confined to the trusted server role while preserving triggers.
revoke all on function public.archive_eecc_document_version() from public, anon, authenticated;
revoke all on function public.ensure_active_profile_user_role_membership() from public, anon, authenticated;
grant execute on function public.archive_eecc_document_version() to service_role;
grant execute on function public.ensure_active_profile_user_role_membership() to service_role;

-- This SECURITY DEFINER routine performs material reservation/work-order updates.
-- Current application flows call it only from trusted server-side code.
revoke all on function public.refresh_work_order_supply_need(uuid) from public, anon, authenticated;
grant execute on function public.refresh_work_order_supply_need(uuid) to service_role;
