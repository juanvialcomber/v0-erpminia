-- Keep Laudus product staging and reconciliation aligned.
-- New source products are projected into integration.laudus_products while
-- terminal ignored product decisions remain closed on subsequent polls.

create or replace function public.motil_ingest_laudus_products(
  p_organization_id uuid,
  p_rows jsonb,
  p_run_id uuid default null::uuid,
  p_finalize boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'integration', 'canonical', 'pg_temp'
as $function$
declare
  v_source_id uuid;
  v_run_id uuid;
  v_row jsonb;
  v_external_id text;
  v_sku text;
  v_prefix text;
  v_hash text;
  v_raw_id uuid;
  v_existing integration.raw_records%rowtype;
  v_match_count integer;
  v_canonical_id uuid;
  v_inserted integer := 0;
  v_changed integer := 0;
  v_unchanged integer := 0;
  v_matched integer := 0;
  v_new integer := 0;
  v_conflict integer := 0;
  v_total integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  v_total := jsonb_array_length(p_rows);
  if v_total > 500 then
    raise exception 'batch too large';
  end if;

  insert into integration.external_sources (
    organization_id, source_key, display_name, mode, enabled, config
  )
  values (
    p_organization_id, 'laudus', 'Laudus ERP', 'read_only', true,
    jsonb_build_object('authority','external_source','write_back',false)
  )
  on conflict (organization_id, source_key)
  do update set
    display_name = excluded.display_name,
    mode = 'read_only',
    enabled = true,
    updated_at = now()
  returning id into v_source_id;

  if p_run_id is null then
    insert into integration.sync_runs (
      organization_id, source_id, run_kind, status, started_at, counters
    )
    values (
      p_organization_id, v_source_id, 'bootstrap', 'running', now(), '{}'::jsonb
    )
    returning id into v_run_id;
  else
    select id into v_run_id
    from integration.sync_runs
    where id = p_run_id
      and organization_id = p_organization_id
      and source_id = v_source_id
      and status = 'running';

    if v_run_id is null then
      raise exception 'invalid or non-running sync run';
    end if;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_external_id := nullif(trim(v_row->>'productId'), '');
    if v_external_id is null then
      continue;
    end if;

    v_sku := nullif(trim(v_row->>'SKU'), '');
    v_prefix := nullif(regexp_replace(upper(coalesce(v_sku,'')), '[0-9].*$', ''), '');
    v_hash := md5(v_row::text);

    select * into v_existing
    from integration.raw_records
    where source_id = v_source_id
      and entity_type = 'product'
      and external_id = v_external_id
      and is_current
    limit 1;

    if found and v_existing.payload_hash = v_hash then
      v_raw_id := v_existing.id;
      v_unchanged := v_unchanged + 1;
    else
      if found then
        update integration.raw_records
        set is_current = false
        where id = v_existing.id;
        v_changed := v_changed + 1;
      end if;

      insert into integration.raw_records (
        organization_id, source_id, sync_run_id, entity_type, external_id,
        payload_hash, payload, is_current
      )
      values (
        p_organization_id, v_source_id, v_run_id, 'product', v_external_id,
        v_hash, v_row, true
      )
      returning id into v_raw_id;
      v_inserted := v_inserted + 1;
    end if;

    select count(*), min(id::text)::uuid
      into v_match_count, v_canonical_id
    from canonical.products
    where organization_id = p_organization_id
      and product_code = v_sku;

    insert into integration.laudus_products (
      organization_id,
      source_id,
      external_id,
      laudus_product_id,
      sku,
      description,
      unit_of_measure,
      sku_prefix,
      operational_category,
      inventory_eligibility,
      reconciliation_status,
      canonical_product_id,
      payload_hash,
      source_payload,
      observed_at,
      synced_at
    )
    values (
      p_organization_id,
      v_source_id,
      v_external_id,
      case when v_external_id ~ '^[0-9]+$' then v_external_id::bigint else null end,
      v_sku,
      nullif(trim(v_row->>'description'), ''),
      nullif(trim(v_row->>'unitOfMeasure'), ''),
      v_prefix,
      case
        when v_prefix = 'REPUESTO' then 'maintenance_supply'
        when v_prefix = 'ACTIVOFIJO' then 'fixed_asset'
        when v_prefix in ('SERVI','SERVICIO') then 'service'
        when v_prefix = 'EPP' then 'safety_supply'
        when v_prefix in ('REACTIVO','EXPLOSIVO') then 'process_consumable'
        when v_prefix = 'VIVERES' then 'general_supply'
        else 'other'
      end,
      case
        when v_prefix in ('ACTIVOFIJO','SERVI','SERVICIO') then 'exclude'
        when v_prefix in ('REPUESTO','EPP','REACTIVO','EXPLOSIVO','VIVERES') then 'eligible'
        else 'review'
      end,
      case
        when v_match_count = 1 then 'matched'
        when v_match_count = 0 then 'new_candidate'
        else 'conflict'
      end,
      case when v_match_count = 1 then v_canonical_id else null end,
      v_hash,
      v_row,
      now(),
      now()
    )
    on conflict (source_id, external_id)
    do update set
      laudus_product_id = excluded.laudus_product_id,
      sku = excluded.sku,
      description = excluded.description,
      unit_of_measure = excluded.unit_of_measure,
      payload_hash = excluded.payload_hash,
      source_payload = excluded.source_payload,
      observed_at = excluded.observed_at,
      synced_at = excluded.synced_at,
      canonical_product_id = case
        when integration.laudus_products.reconciliation_status = 'ignored'
          then integration.laudus_products.canonical_product_id
        else excluded.canonical_product_id
      end,
      reconciliation_status = case
        when integration.laudus_products.reconciliation_status = 'ignored'
          then 'ignored'
        else excluded.reconciliation_status
      end;

    insert into integration.reconciliation_items (
      organization_id, source_id, raw_record_id, entity_type, external_id,
      canonical_schema, canonical_table, canonical_id,
      resolution_status, resolution_method, confidence,
      conflict_reasons, proposed_patch
    )
    values (
      p_organization_id, v_source_id, v_raw_id, 'product', v_external_id,
      'canonical', 'products',
      case when v_match_count = 1 then v_canonical_id::text else null end,
      case when v_match_count = 1 then 'matched'
           when v_match_count = 0 then 'new_candidate'
           else 'conflict' end,
      case when v_match_count = 1 then 'exact_code' else null end,
      case when v_match_count = 1 then 1 else null end,
      case when v_match_count > 1 then array['duplicate_canonical_product_code']::text[] else '{}'::text[] end,
      case when v_match_count = 1 then jsonb_build_object(
        'source_sku', v_row->>'SKU',
        'source_description', v_row->>'description',
        'source_unit', v_row->>'unitOfMeasure'
      ) else null end
    )
    on conflict (source_id, entity_type, external_id, raw_record_id)
    do update set
      canonical_id = case
        when integration.reconciliation_items.resolution_status = 'ignored'
          then integration.reconciliation_items.canonical_id
        else excluded.canonical_id
      end,
      resolution_status = case
        when integration.reconciliation_items.resolution_status = 'ignored'
          then 'ignored'
        else excluded.resolution_status
      end,
      resolution_method = case
        when integration.reconciliation_items.resolution_status = 'ignored'
          then integration.reconciliation_items.resolution_method
        else excluded.resolution_method
      end,
      confidence = case
        when integration.reconciliation_items.resolution_status = 'ignored'
          then integration.reconciliation_items.confidence
        else excluded.confidence
      end,
      conflict_reasons = case
        when integration.reconciliation_items.resolution_status = 'ignored'
          then integration.reconciliation_items.conflict_reasons
        else excluded.conflict_reasons
      end,
      proposed_patch = case
        when integration.reconciliation_items.resolution_status = 'ignored'
          then integration.reconciliation_items.proposed_patch
        else excluded.proposed_patch
      end,
      updated_at = now();

    if v_match_count = 1 then
      v_matched := v_matched + 1;
    elsif v_match_count = 0 then
      v_new := v_new + 1;
    else
      v_conflict := v_conflict + 1;
    end if;
  end loop;

  -- Repair any fixed-asset/service product reviews that an older poll reopened.
  update integration.reconciliation_items ri
  set resolution_status = 'ignored',
      resolution_method = null,
      confidence = null,
      conflict_reasons = '{}'::text[],
      updated_at = now()
  from integration.laudus_products lp
  where ri.organization_id = p_organization_id
    and ri.source_id = v_source_id
    and ri.entity_type = 'product'
    and ri.external_id = lp.external_id
    and lp.organization_id = p_organization_id
    and lp.reconciliation_status = 'ignored'
    and ri.resolution_status <> 'ignored';

  update integration.sync_runs
  set
    counters = jsonb_build_object(
      'processed', coalesce((counters->>'processed')::int,0) + v_total,
      'inserted', coalesce((counters->>'inserted')::int,0) + v_inserted,
      'changed', coalesce((counters->>'changed')::int,0) + v_changed,
      'unchanged', coalesce((counters->>'unchanged')::int,0) + v_unchanged,
      'matched', coalesce((counters->>'matched')::int,0) + v_matched,
      'new_candidate', coalesce((counters->>'new_candidate')::int,0) + v_new,
      'conflict', coalesce((counters->>'conflict')::int,0) + v_conflict
    ),
    checkpoint = jsonb_build_object('entity_type','product','last_batch_size',v_total),
    status = case when p_finalize then 'completed' else status end,
    finished_at = case when p_finalize then now() else finished_at end
  where id = v_run_id;

  return jsonb_build_object(
    'run_id', v_run_id,
    'source_id', v_source_id,
    'batch_rows', v_total,
    'inserted', v_inserted,
    'changed', v_changed,
    'unchanged', v_unchanged,
    'matched', v_matched,
    'new_candidate', v_new,
    'conflict', v_conflict,
    'finalized', p_finalize
  );
end;
$function$;

-- Repair the known terminal product decisions immediately on migration.
update integration.reconciliation_items ri
set resolution_status = 'ignored',
    resolution_method = null,
    confidence = null,
    conflict_reasons = '{}'::text[],
    updated_at = now()
from integration.laudus_products lp
where ri.organization_id = lp.organization_id
  and ri.source_id = lp.source_id
  and ri.entity_type = 'product'
  and ri.external_id = lp.external_id
  and lp.reconciliation_status = 'ignored'
  and ri.resolution_status <> 'ignored';

revoke all on function public.motil_ingest_laudus_products(uuid,jsonb,uuid,boolean) from public, anon, authenticated;
grant execute on function public.motil_ingest_laudus_products(uuid,jsonb,uuid,boolean) to service_role;
