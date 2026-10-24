-- Reconcile Laudus financial masters using source semantics discovered from live data.
-- Laudus "code" is an internal identifier; the operational cost-center code is the leading token in name.

alter table integration.laudus_cost_centers
  add column if not exists operational_code text;

alter table integration.laudus_fixed_assets
  add column if not exists supplier_name text;

create index if not exists laudus_cost_centers_org_operational_code_idx
  on integration.laudus_cost_centers(organization_id, operational_code);

create or replace function public.motil_reconcile_laudus_financial_masters(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, canonical, pg_temp
as $function$
declare
  v_cc_matched integer := 0;
  v_cc_pending integer := 0;
  v_asset_matched integer := 0;
  v_asset_pending integer := 0;
begin
  update integration.laudus_cost_centers l
  set operational_code = nullif(
    substring(coalesce(l.name,'') from '^([0-9]+(?:-[0-9]+)*)[[:space:]]+'),
    ''
  )
  where l.organization_id = p_organization_id;

  update integration.laudus_cost_centers l
  set canonical_cost_center_id = c.id,
      reconciliation_status = 'matched'
  from canonical.cost_centers c
  where l.organization_id = p_organization_id
    and c.organization_id = p_organization_id
    and l.operational_code is not null
    and lower(trim(c.cost_center_code)) = lower(trim(l.operational_code));

  update integration.laudus_cost_centers l
  set canonical_cost_center_id = null,
      reconciliation_status = 'pending'
  where l.organization_id = p_organization_id
    and not exists (
      select 1
      from canonical.cost_centers c
      where c.organization_id = p_organization_id
        and l.operational_code is not null
        and lower(trim(c.cost_center_code)) = lower(trim(l.operational_code))
    );

  update integration.reconciliation_items ri
  set canonical_schema = 'canonical',
      canonical_table = 'cost_centers',
      canonical_id = l.canonical_cost_center_id::text,
      resolution_status = case when l.reconciliation_status='matched' then 'matched' else 'new_candidate' end,
      resolution_method = case when l.reconciliation_status='matched' then 'deterministic_rule' else null end,
      confidence = case when l.reconciliation_status='matched' then 1 else null end,
      conflict_reasons = '{}'::text[]
  from integration.laudus_cost_centers l
  where ri.organization_id = p_organization_id
    and ri.entity_type = 'cost_center'
    and ri.external_id = l.external_id
    and l.organization_id = p_organization_id;

  update integration.laudus_fixed_assets l
  set supplier_name = nullif(l.source_payload->>'supplier','')
  where l.organization_id = p_organization_id;

  update integration.laudus_fixed_assets l
  set canonical_asset_id = c.id,
      reconciliation_status = 'matched'
  from canonical.assets c
  where l.organization_id = p_organization_id
    and c.organization_id = p_organization_id
    and l.serial_number is not null
    and trim(l.serial_number) <> ''
    and c.serial_number is not null
    and lower(trim(c.serial_number)) = lower(trim(l.serial_number))
    and (
      select count(*)
      from canonical.assets c2
      where c2.organization_id = p_organization_id
        and c2.serial_number is not null
        and lower(trim(c2.serial_number)) = lower(trim(l.serial_number))
    ) = 1;

  update integration.reconciliation_items ri
  set canonical_schema = 'canonical',
      canonical_table = 'assets',
      canonical_id = l.canonical_asset_id::text,
      resolution_status = case when l.reconciliation_status='matched' then 'matched' else 'new_candidate' end,
      resolution_method = case when l.reconciliation_status='matched' then 'deterministic_rule' else null end,
      confidence = case when l.reconciliation_status='matched' then 1 else null end
  from integration.laudus_fixed_assets l
  where ri.organization_id = p_organization_id
    and ri.entity_type = 'fixed_asset'
    and ri.external_id = l.external_id
    and l.organization_id = p_organization_id;

  select count(*) filter (where reconciliation_status='matched'),
         count(*) filter (where reconciliation_status<>'matched')
  into v_cc_matched, v_cc_pending
  from integration.laudus_cost_centers
  where organization_id = p_organization_id;

  select count(*) filter (where reconciliation_status='matched'),
         count(*) filter (where reconciliation_status<>'matched')
  into v_asset_matched, v_asset_pending
  from integration.laudus_fixed_assets
  where organization_id = p_organization_id;

  return jsonb_build_object(
    'cost_centers_matched', v_cc_matched,
    'cost_centers_pending', v_cc_pending,
    'fixed_assets_matched', v_asset_matched,
    'fixed_assets_pending', v_asset_pending,
    'canonical_mutated', false,
    'laudus_mutated', false
  );
end;
$function$;

revoke all on function public.motil_reconcile_laudus_financial_masters(uuid)
  from public, anon, authenticated;
grant execute on function public.motil_reconcile_laudus_financial_masters(uuid)
  to service_role;

select public.motil_reconcile_laudus_financial_masters(
  '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee'::uuid
);
