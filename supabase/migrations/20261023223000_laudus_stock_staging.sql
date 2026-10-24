-- Laudus inventory stock staging.
-- Keeps Laudus as ERP evidence and never mutates MOTIL operational warehouse stock.

create or replace function public.motil_ingest_laudus_product_stock(
  p_organization_id uuid,
  p_warehouse_external_id text,
  p_date_to timestamptz,
  p_rows jsonb,
  p_run_id uuid default null,
  p_finalize boolean default false
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
  v_product_external_id text;
  v_warehouse_external_id text;
  v_lot text;
  v_stock numeric;
  v_hash text;
  v_payload jsonb;
  v_external_id text;
  v_raw_id uuid;
  v_existing integration.raw_records%rowtype;
  v_total integer;
  v_inserted integer := 0;
  v_changed integer := 0;
  v_unchanged integer := 0;
  v_product_resolved integer := 0;
  v_product_unresolved integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  v_total := jsonb_array_length(p_rows);
  if v_total > 500 then
    raise exception 'batch too large';
  end if;

  v_warehouse_external_id := nullif(trim(p_warehouse_external_id), '');
  if v_warehouse_external_id is null then
    raise exception 'warehouse external id is required';
  end if;

  select id into v_source_id
  from integration.external_sources
  where organization_id = p_organization_id
    and source_key = 'laudus'
    and enabled
  limit 1;

  if v_source_id is null then
    raise exception 'Laudus source is not configured';
  end if;

  if p_run_id is null then
    insert into integration.sync_runs (
      organization_id, source_id, run_kind, status, started_at, counters
    )
    values (
      p_organization_id,
      v_source_id,
      'bootstrap',
      'running',
      now(),
      '{}'::jsonb
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
    v_product_external_id := nullif(trim(v_row->>'productId'), '');
    if v_product_external_id is null or v_product_external_id !~ '^[0-9]+$' then
      raise exception 'invalid Laudus productId';
    end if;

    if nullif(trim(v_row->>'stock'), '') is null then
      raise exception 'missing Laudus stock for product %', v_product_external_id;
    end if;

    begin
      v_stock := (v_row->>'stock')::numeric;
    exception when others then
      raise exception 'invalid Laudus stock for product %', v_product_external_id;
    end;

    v_lot := coalesce(nullif(trim(v_row->>'lot'), ''), '');
    v_external_id := concat_ws(':', v_product_external_id, v_warehouse_external_id, v_lot);

    v_payload := jsonb_build_object(
      'productId', v_product_external_id,
      'sku', nullif(trim(v_row->>'sku'), ''),
      'stock', v_stock,
      'warehouseId', v_warehouse_external_id,
      'lot', nullif(v_lot, ''),
      'dateTo', p_date_to
    );

    -- dateTo is observation metadata, not part of the business-state hash.
    v_hash := md5(jsonb_build_object(
      'productId', v_product_external_id,
      'sku', nullif(trim(v_row->>'sku'), ''),
      'stock', v_stock,
      'warehouseId', v_warehouse_external_id,
      'lot', v_lot
    )::text);

    select * into v_existing
    from integration.raw_records
    where source_id = v_source_id
      and entity_type = 'stock'
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
        organization_id,
        source_id,
        sync_run_id,
        entity_type,
        external_id,
        source_updated_at,
        payload_hash,
        payload,
        is_current
      )
      values (
        p_organization_id,
        v_source_id,
        v_run_id,
        'stock',
        v_external_id,
        p_date_to,
        v_hash,
        v_payload,
        true
      )
      on conflict (source_id, entity_type, external_id, payload_hash)
      do update set
        sync_run_id = excluded.sync_run_id,
        source_updated_at = excluded.source_updated_at,
        payload = excluded.payload,
        is_current = true
      returning id into v_raw_id;

      v_inserted := v_inserted + 1;
    end if;

    insert into integration.laudus_product_stock (
      organization_id,
      source_id,
      product_external_id,
      warehouse_external_id,
      lot,
      stock,
      source_date_to,
      payload_hash,
      source_payload,
      observed_at,
      synced_at
    )
    values (
      p_organization_id,
      v_source_id,
      v_product_external_id,
      v_warehouse_external_id,
      v_lot,
      v_stock,
      p_date_to,
      v_hash,
      v_payload,
      now(),
      now()
    )
    on conflict (source_id, product_external_id, warehouse_external_id, lot)
    do update set
      stock = excluded.stock,
      source_date_to = excluded.source_date_to,
      payload_hash = excluded.payload_hash,
      source_payload = excluded.source_payload,
      observed_at = excluded.observed_at,
      synced_at = now();

    if exists (
      select 1
      from integration.laudus_products
      where source_id = v_source_id
        and external_id = v_product_external_id
        and reconciliation_status = 'matched'
        and canonical_product_id is not null
    ) then
      v_product_resolved := v_product_resolved + 1;
    else
      v_product_unresolved := v_product_unresolved + 1;
    end if;
  end loop;

  update integration.sync_runs
  set
    counters = coalesce(counters, '{}'::jsonb) || jsonb_build_object(
      'processed', coalesce((counters->>'processed')::int, 0) + v_total,
      'inserted', coalesce((counters->>'inserted')::int, 0) + v_inserted,
      'changed', coalesce((counters->>'changed')::int, 0) + v_changed,
      'unchanged', coalesce((counters->>'unchanged')::int, 0) + v_unchanged,
      'product_resolved', coalesce((counters->>'product_resolved')::int, 0) + v_product_resolved,
      'product_unresolved', coalesce((counters->>'product_unresolved')::int, 0) + v_product_unresolved
    ),
    checkpoint = jsonb_build_object(
      'entity_type', 'stock',
      'warehouse_external_id', v_warehouse_external_id,
      'date_to', p_date_to,
      'last_batch_size', v_total
    ),
    status = case when p_finalize then 'completed' else status end,
    finished_at = case when p_finalize then now() else finished_at end
  where id = v_run_id;

  return jsonb_build_object(
    'run_id', v_run_id,
    'source_id', v_source_id,
    'warehouse_external_id', v_warehouse_external_id,
    'batch_rows', v_total,
    'inserted', v_inserted,
    'changed', v_changed,
    'unchanged', v_unchanged,
    'product_resolved', v_product_resolved,
    'product_unresolved', v_product_unresolved,
    'finalized', p_finalize
  );
end;
$function$;

revoke all on function public.motil_ingest_laudus_product_stock(uuid, text, timestamptz, jsonb, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.motil_ingest_laudus_product_stock(uuid, text, timestamptz, jsonb, uuid, boolean)
  to service_role;

comment on function public.motil_ingest_laudus_product_stock(uuid, text, timestamptz, jsonb, uuid, boolean)
  is 'Stages bounded Laudus stock evidence by warehouse. Never overwrites MOTIL operational stock.';
