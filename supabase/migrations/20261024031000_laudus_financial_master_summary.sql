-- Read-only summary for Laudus cost centers and fixed assets.
create or replace function public.motil_get_laudus_financial_master_summary(
  p_organization_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, integration, canonical, pg_temp
as $function$
with cc as (
  select *
  from integration.laudus_cost_centers
  where organization_id = p_organization_id
),
fa as (
  select *
  from integration.laudus_fixed_assets
  where organization_id = p_organization_id
)
select jsonb_build_object(
  'costCenters', jsonb_build_object(
    'total', (select count(*) from cc),
    'active', (select count(*) from cc where not discontinued),
    'withHierarchy', (select count(*) from cc where parent_external_id is not null or full_path is not null),
    'matched', (select count(*) from cc where reconciliation_status='matched'),
    'pending', (select count(*) from cc where reconciliation_status='pending'),
    'conflicts', (select count(*) from cc where reconciliation_status='conflict')
  ),
  'fixedAssets', jsonb_build_object(
    'total', (select count(*) from fa),
    'withSerial', (select count(*) from fa where serial_number is not null),
    'withAcquisitionDate', (select count(*) from fa where acquisition_date is not null),
    'withAcquisitionCost', (select count(*) from fa where acquisition_cost is not null),
    'withUsefulLife', (select count(*) from fa where useful_life is not null),
    'withLocation', (select count(*) from fa where location is not null),
    'withSupplier', (select count(*) from fa where supplier_external_id is not null),
    'withInvoiceNumber', (select count(*) from fa where invoice_number is not null),
    'matched', (select count(*) from fa where reconciliation_status='matched'),
    'pending', (select count(*) from fa where reconciliation_status='pending'),
    'conflicts', (select count(*) from fa where reconciliation_status='conflict'),
    'acquisitionCostTotal', (select coalesce(sum(acquisition_cost),0) from fa)
  ),
  'policy', jsonb_build_object(
    'laudusRole','financial_source',
    'motilAssetRole','operational_authority',
    'autoMerge',false,
    'humanReviewRequired',true
  )
);
$function$;

revoke all on function public.motil_get_laudus_financial_master_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.motil_get_laudus_financial_master_summary(uuid)
  to service_role;
