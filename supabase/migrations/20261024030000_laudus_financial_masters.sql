-- Laudus financial masters: cost centers and fixed assets.
-- Private read-only staging and reconciliation. No canonical MOTIL rows are mutated.

create table if not exists integration.laudus_cost_centers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete restrict,
  external_id text not null,
  cost_center_code text,
  name text,
  full_path text,
  parent_external_id text,
  discontinued boolean not null default false,
  canonical_cost_center_id uuid,
  reconciliation_status text not null default 'pending'
    check (reconciliation_status in ('pending','matched','candidate','conflict','ignored')),
  payload_hash text not null,
  source_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (organization_id, source_id, external_id)
);

create index if not exists laudus_cost_centers_org_code_idx
  on integration.laudus_cost_centers(organization_id, cost_center_code);

create table if not exists integration.laudus_fixed_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete restrict,
  external_id text not null,
  name text,
  acquisition_date date,
  retirement_date date,
  acquisition_cost numeric,
  useful_life numeric,
  realizable_value numeric,
  depreciation_type text,
  manufacturer text,
  model text,
  serial_number text,
  supplier_external_id text,
  invoice_number text,
  location text,
  canonical_asset_id uuid,
  reconciliation_status text not null default 'pending'
    check (reconciliation_status in ('pending','matched','candidate','conflict','ignored')),
  payload_hash text not null,
  source_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (organization_id, source_id, external_id)
);

create index if not exists laudus_fixed_assets_org_serial_idx
  on integration.laudus_fixed_assets(organization_id, serial_number)
  where serial_number is not null;

revoke all on integration.laudus_cost_centers from public, anon, authenticated;
revoke all on integration.laudus_fixed_assets from public, anon, authenticated;
grant select, insert, update, delete on integration.laudus_cost_centers to service_role;
grant select, insert, update, delete on integration.laudus_fixed_assets to service_role;

create or replace function public.motil_ingest_laudus_financial_masters(
  p_organization_id uuid,
  p_cost_centers jsonb default '[]'::jsonb,
  p_fixed_assets jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, canonical, pg_temp
as $function$
declare
  v_source_id uuid;
  v_run_id uuid;
  v_row jsonb;
  v_external_id text;
  v_hash text;
  v_raw_id uuid;
  v_cc_match uuid;
  v_cc_matches int;
  v_asset_match uuid;
  v_asset_matches int;
  v_cc_count int := 0;
  v_asset_count int := 0;
  v_cc_matched int := 0;
  v_asset_matched int := 0;
begin
  select id into v_source_id
  from integration.external_sources
  where organization_id = p_organization_id
    and source_key = 'laudus'
    and enabled
  limit 1;

  if v_source_id is null then
    raise exception 'Laudus source is not enabled for organization';
  end if;

  insert into integration.sync_runs(
    organization_id, source_id, run_kind, status, started_at, checkpoint
  ) values (
    p_organization_id, v_source_id, 'delta', 'running', now(),
    jsonb_build_object('entity_type','financial_masters')
  ) returning id into v_run_id;

  for v_row in select value from jsonb_array_elements(coalesce(p_cost_centers, '[]'::jsonb))
  loop
    v_external_id := nullif(trim(coalesce(v_row->>'costCenterId', v_row->>'code', '')), '');
    if v_external_id is null then
      continue;
    end if;
    v_hash := md5(v_row::text);

    update integration.raw_records
    set is_current = false
    where source_id = v_source_id
      and entity_type = 'cost_center'
      and external_id = v_external_id
      and is_current
      and payload_hash <> v_hash;

    select id into v_raw_id
    from integration.raw_records
    where source_id = v_source_id
      and entity_type = 'cost_center'
      and external_id = v_external_id
      and payload_hash = v_hash
    limit 1;

    if v_raw_id is null then
      insert into integration.raw_records(
        organization_id, source_id, sync_run_id, entity_type, external_id,
        source_updated_at, observed_at, payload_hash, payload, is_current
      ) values (
        p_organization_id, v_source_id, v_run_id, 'cost_center', v_external_id,
        nullif(v_row->>'modifiedAt','')::timestamptz, now(), v_hash, v_row, true
      ) returning id into v_raw_id;
    else
      update integration.raw_records set is_current=true where id=v_raw_id;
    end if;

    select count(*), min(id)
      into v_cc_matches, v_cc_match
    from canonical.cost_centers
    where organization_id = p_organization_id
      and lower(trim(cost_center_code)) = lower(trim(coalesce(nullif(v_row->>'code',''), v_external_id)));

    insert into integration.laudus_cost_centers(
      organization_id, source_id, external_id, cost_center_code, name, full_path,
      parent_external_id, discontinued, canonical_cost_center_id,
      reconciliation_status, payload_hash, source_payload, synced_at
    ) values (
      p_organization_id, v_source_id, v_external_id,
      coalesce(nullif(v_row->>'code',''), v_external_id),
      nullif(v_row->>'name',''),
      nullif(v_row->>'fullPath',''),
      nullif(v_row->>'parentId',''),
      coalesce((v_row->>'discontinued')::boolean,false),
      case when v_cc_matches=1 then v_cc_match else null end,
      case when v_cc_matches=1 then 'matched' when v_cc_matches>1 then 'conflict' else 'pending' end,
      v_hash, v_row, now()
    )
    on conflict (organization_id, source_id, external_id) do update set
      cost_center_code=excluded.cost_center_code,
      name=excluded.name,
      full_path=excluded.full_path,
      parent_external_id=excluded.parent_external_id,
      discontinued=excluded.discontinued,
      canonical_cost_center_id=excluded.canonical_cost_center_id,
      reconciliation_status=excluded.reconciliation_status,
      payload_hash=excluded.payload_hash,
      source_payload=excluded.source_payload,
      synced_at=now();

    insert into integration.reconciliation_items(
      organization_id, source_id, raw_record_id, entity_type, external_id,
      canonical_schema, canonical_table, canonical_id, resolution_status,
      resolution_method, confidence, conflict_reasons, proposed_patch
    ) values (
      p_organization_id, v_source_id, v_raw_id, 'cost_center', v_external_id,
      'canonical','cost_centers',case when v_cc_matches=1 then v_cc_match::text else null end,
      case when v_cc_matches=1 then 'matched' when v_cc_matches>1 then 'conflict' else 'new_candidate' end,
      case when v_cc_matches=1 then 'exact_code' else null end,
      case when v_cc_matches=1 then 1 else null end,
      case when v_cc_matches>1 then array['duplicate_canonical_code']::text[] else '{}'::text[] end,
      null
    ) on conflict (source_id, entity_type, external_id, raw_record_id) do nothing;

    v_cc_count := v_cc_count + 1;
    if v_cc_matches=1 then v_cc_matched := v_cc_matched + 1; end if;
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(p_fixed_assets, '[]'::jsonb))
  loop
    v_external_id := nullif(trim(coalesce(v_row->>'fixedAssetId','')), '');
    if v_external_id is null then
      continue;
    end if;
    v_hash := md5(v_row::text);

    update integration.raw_records
    set is_current = false
    where source_id = v_source_id
      and entity_type = 'fixed_asset'
      and external_id = v_external_id
      and is_current
      and payload_hash <> v_hash;

    select id into v_raw_id
    from integration.raw_records
    where source_id = v_source_id
      and entity_type = 'fixed_asset'
      and external_id = v_external_id
      and payload_hash = v_hash
    limit 1;

    if v_raw_id is null then
      insert into integration.raw_records(
        organization_id, source_id, sync_run_id, entity_type, external_id,
        source_updated_at, observed_at, payload_hash, payload, is_current
      ) values (
        p_organization_id, v_source_id, v_run_id, 'fixed_asset', v_external_id,
        nullif(v_row->>'modifiedAt','')::timestamptz, now(), v_hash, v_row, true
      ) returning id into v_raw_id;
    else
      update integration.raw_records set is_current=true where id=v_raw_id;
    end if;

    v_asset_match := null;
    v_asset_matches := 0;
    if nullif(trim(coalesce(v_row->>'serialNumber','')), '') is not null then
      select count(*), min(id)
        into v_asset_matches, v_asset_match
      from canonical.assets
      where organization_id = p_organization_id
        and serial_number is not null
        and lower(trim(serial_number)) = lower(trim(v_row->>'serialNumber'));
    end if;

    insert into integration.laudus_fixed_assets(
      organization_id, source_id, external_id, name, acquisition_date, retirement_date,
      acquisition_cost, useful_life, realizable_value, depreciation_type,
      manufacturer, model, serial_number, supplier_external_id, invoice_number,
      location, canonical_asset_id, reconciliation_status, payload_hash, source_payload, synced_at
    ) values (
      p_organization_id, v_source_id, v_external_id, nullif(v_row->>'name',''),
      nullif(v_row->>'dateAcquisition','')::date,
      nullif(v_row->>'dateRetirement','')::date,
      nullif(v_row->>'acquisitionCost','')::numeric,
      nullif(v_row->>'usefulLife','')::numeric,
      nullif(v_row->>'realizableValue','')::numeric,
      nullif(v_row->>'depreciationType',''),
      nullif(v_row->>'manufacturer',''),
      nullif(v_row->>'model',''),
      nullif(v_row->>'serialNumber',''),
      coalesce(v_row#>>'{supplier,supplierId}', nullif(v_row->>'supplierId','')),
      nullif(v_row->>'invoiceNumber',''),
      nullif(v_row->>'location',''),
      case when v_asset_matches=1 then v_asset_match else null end,
      case when v_asset_matches=1 then 'matched' when v_asset_matches>1 then 'conflict' else 'pending' end,
      v_hash, v_row, now()
    )
    on conflict (organization_id, source_id, external_id) do update set
      name=excluded.name,
      acquisition_date=excluded.acquisition_date,
      retirement_date=excluded.retirement_date,
      acquisition_cost=excluded.acquisition_cost,
      useful_life=excluded.useful_life,
      realizable_value=excluded.realizable_value,
      depreciation_type=excluded.depreciation_type,
      manufacturer=excluded.manufacturer,
      model=excluded.model,
      serial_number=excluded.serial_number,
      supplier_external_id=excluded.supplier_external_id,
      invoice_number=excluded.invoice_number,
      location=excluded.location,
      canonical_asset_id=excluded.canonical_asset_id,
      reconciliation_status=excluded.reconciliation_status,
      payload_hash=excluded.payload_hash,
      source_payload=excluded.source_payload,
      synced_at=now();

    insert into integration.reconciliation_items(
      organization_id, source_id, raw_record_id, entity_type, external_id,
      canonical_schema, canonical_table, canonical_id, resolution_status,
      resolution_method, confidence, conflict_reasons, proposed_patch
    ) values (
      p_organization_id, v_source_id, v_raw_id, 'fixed_asset', v_external_id,
      'canonical','assets',case when v_asset_matches=1 then v_asset_match::text else null end,
      case when v_asset_matches=1 then 'matched' when v_asset_matches>1 then 'conflict' else 'new_candidate' end,
      case when v_asset_matches=1 then 'deterministic_rule' else null end,
      case when v_asset_matches=1 then 1 else null end,
      case when v_asset_matches>1 then array['duplicate_serial_number']::text[] else '{}'::text[] end,
      null
    ) on conflict (source_id, entity_type, external_id, raw_record_id) do nothing;

    v_asset_count := v_asset_count + 1;
    if v_asset_matches=1 then v_asset_matched := v_asset_matched + 1; end if;
  end loop;

  update integration.sync_runs
  set status='completed', finished_at=now(),
      counters=jsonb_build_object(
        'cost_centers',v_cc_count,
        'cost_centers_matched',v_cc_matched,
        'fixed_assets',v_asset_count,
        'fixed_assets_matched',v_asset_matched
      )
  where id=v_run_id;

  return jsonb_build_object(
    'run_id',v_run_id,
    'cost_centers',v_cc_count,
    'cost_centers_matched',v_cc_matched,
    'fixed_assets',v_asset_count,
    'fixed_assets_matched',v_asset_matched,
    'canonical_mutated',false,
    'laudus_mutated',false
  );
end;
$function$;

revoke all on function public.motil_ingest_laudus_financial_masters(uuid,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.motil_ingest_laudus_financial_masters(uuid,jsonb,jsonb)
  to service_role;

comment on function public.motil_ingest_laudus_financial_masters(uuid,jsonb,jsonb)
  is 'Stages Laudus cost centers and fixed assets read-only; canonical MOTIL entities are never mutated.';
