-- On-demand Laudus product kardex staging.
-- No cron and no canonical promotion: one product per explicit admin request.

create or replace function public.motil_ingest_laudus_product_kardex(
  p_organization_id uuid,
  p_product_external_id text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, pg_temp
as $$
declare
  v_source_id uuid;
  v_row jsonb;
  v_movement_id text;
  v_hash text;
  v_rows integer := 0;
begin
  if p_product_external_id is null or btrim(p_product_external_id) = '' then
    raise exception 'product external id required';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'batch too large';
  end if;

  select id into v_source_id
  from integration.external_sources
  where organization_id=p_organization_id
    and source_key='laudus'
    and enabled=true
  limit 1;
  if v_source_id is null then raise exception 'Enabled Laudus source not found'; end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_movement_id := nullif(btrim(coalesce(v_row->>'movementId',v_row->>'id','')), '');
    if v_movement_id is null then continue; end if;
    v_hash := md5(v_row::text);

    insert into integration.laudus_product_kardex (
      organization_id, source_id, product_external_id, movement_external_id,
      movement_date, movement_type, description, quantity, resulting_stock,
      payload_hash, source_payload, observed_at, synced_at
    ) values (
      p_organization_id,
      v_source_id,
      p_product_external_id,
      v_movement_id,
      coalesce(nullif(v_row->>'date','')::timestamptz, nullif(v_row->>'movementDate','')::timestamptz),
      coalesce(nullif(v_row->>'movementType',''), nullif(v_row->>'type','')),
      nullif(v_row->>'description',''),
      case when nullif(v_row->>'quantity','') is not null then (v_row->>'quantity')::numeric else null end,
      case when nullif(v_row->>'stock','') is not null then (v_row->>'stock')::numeric
           when nullif(v_row->>'resultingStock','') is not null then (v_row->>'resultingStock')::numeric
           else null end,
      v_hash,
      v_row,
      now(),
      now()
    )
    on conflict (source_id, product_external_id, movement_external_id, payload_hash)
    do update set
      movement_date=excluded.movement_date,
      movement_type=excluded.movement_type,
      description=excluded.description,
      quantity=excluded.quantity,
      resulting_stock=excluded.resulting_stock,
      source_payload=excluded.source_payload,
      observed_at=excluded.observed_at,
      synced_at=excluded.synced_at;

    v_rows := v_rows + 1;
  end loop;

  return jsonb_build_object(
    'rows',v_rows,
    'product_external_id',p_product_external_id,
    'staging_only',true,
    'canonical_mutated',false,
    'laudus_mutated',false
  );
end;
$$;

revoke all on function public.motil_ingest_laudus_product_kardex(uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.motil_ingest_laudus_product_kardex(uuid,text,jsonb)
  to service_role;
