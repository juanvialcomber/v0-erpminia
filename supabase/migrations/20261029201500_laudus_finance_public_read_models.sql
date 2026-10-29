-- Public read models for Laudus finance control.
-- Keep integration tables private; expose only finance fields required by MOTIL.

create or replace view public.laudus_purchase_payments_service_v1
with (security_invoker=true) as
select
  id, organization_id, external_id, synced_at,
  source_id, laudus_payment_id, issued_date, due_date, document, deposited,
  payment_type, bank, account_other, journal_entry_issued,
  journal_entry_deposited, notes, source_payload
from integration.laudus_purchase_payments;

create or replace view public.laudus_cost_centers_service_v1
with (security_invoker=true) as
select
  id, organization_id, source_id, external_id, cost_center_code, name,
  full_path, parent_external_id, discontinued, canonical_cost_center_id,
  reconciliation_status, operational_code, synced_at
from integration.laudus_cost_centers;

create or replace view public.laudus_fixed_assets_service_v1
with (security_invoker=true) as
select
  id, organization_id, source_id, external_id, name, acquisition_date,
  retirement_date, acquisition_cost, useful_life, realizable_value,
  depreciation_type, manufacturer, model, serial_number,
  supplier_external_id, invoice_number, location, canonical_asset_id,
  reconciliation_status, synced_at, supplier_name
from integration.laudus_fixed_assets;

create or replace view public.laudus_suppliers_service_v1
with (security_invoker=true) as
select
  id, organization_id, source_id, external_id, laudus_supplier_id,
  tax_id, name, legal_name, payment_term, reconciliation_status,
  canonical_supplier_id, observed_at, synced_at
from integration.laudus_suppliers;

revoke all on public.laudus_purchase_payments_service_v1 from public,anon,authenticated;
revoke all on public.laudus_cost_centers_service_v1 from public,anon,authenticated;
revoke all on public.laudus_fixed_assets_service_v1 from public,anon,authenticated;
revoke all on public.laudus_suppliers_service_v1 from public,anon,authenticated;

grant select on public.laudus_purchase_payments_service_v1 to service_role;
grant select on public.laudus_cost_centers_service_v1 to service_role;
grant select on public.laudus_fixed_assets_service_v1 to service_role;
grant select on public.laudus_suppliers_service_v1 to service_role;
