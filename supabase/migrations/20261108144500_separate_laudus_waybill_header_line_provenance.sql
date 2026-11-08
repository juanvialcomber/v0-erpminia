-- Keep Laudus purchase-waybill header provenance independent from item rows.
-- Item-level source evidence remains in integration.laudus_waybill_lines.source_payload.

create or replace function public.motil_ingest_laudus_waybill_rows(
  p_organization_id uuid,
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
  v_external_id text;
  v_line_key text;
  v_hash text;
  v_issued timestamptz;
  v_flags text[];
  v_header_payload jsonb;
  v_rows integer := 0;
  v_lines integer := 0;
begin
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
  limit 1;
  if v_source_id is null then
    raise exception 'Laudus source is not configured';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_external_id := nullif(trim(v_row->>'purchaseWaybillId'),'');
    if v_external_id is null then continue; end if;

    v_issued := nullif(v_row->>'issuedDate','')::timestamptz;
    v_flags := '{}'::text[];
    if v_issued is null then v_flags := array_append(v_flags,'missing_issued_date'); end if;
    if v_issued is not null and v_issued > now() + interval '1 day' then
      v_flags := array_append(v_flags,'future_issued_date');
    end if;
    if nullif(trim(v_row->>'supplier_VATId'),'') is null then
      v_flags := array_append(v_flags,'missing_supplier_tax_id');
    end if;

    v_header_payload := v_row - array[
      'items_itemId',
      'items_product_productId',
      'items_product_sku',
      'items_product_description',
      'items_product_unitOfMeasure',
      'items_itemDescription',
      'items_quantity',
      'items_originalUnitCost',
      'items_currencyCode',
      'items_parityToMainCurrency',
      'items_unitCost',
      'items_costCenter_costCenterId'
    ];

    v_hash := md5(jsonb_build_object(
      'purchaseWaybillId',v_row->'purchaseWaybillId',
      'docNumber',v_row->'docNumber',
      'issuedDate',v_row->'issuedDate',
      'supplier_supplierId',v_row->'supplier_supplierId',
      'supplier_name',v_row->'supplier_name',
      'supplier_legalName',v_row->'supplier_legalName',
      'supplier_VATId',v_row->'supplier_VATId',
      'warehouse_warehouseId',v_row->'warehouse_warehouseId',
      'warehouse_name',v_row->'warehouse_name'
    )::text);

    insert into integration.laudus_waybills(
      organization_id,source_id,external_id,laudus_purchase_waybill_id,doc_number,
      supplier_external_id,supplier_name,supplier_tax_id,warehouse_external_id,warehouse_name,
      issued_date,quality_flags,payload_hash,source_payload,synced_at
    ) values (
      p_organization_id,v_source_id,v_external_id,
      case when v_external_id ~ '^[0-9]+$' then v_external_id::bigint else null end,
      nullif(trim(v_row->>'docNumber'),''),
      nullif(trim(v_row->>'supplier_supplierId'),''),
      coalesce(nullif(trim(v_row->>'supplier_legalName'),''),nullif(trim(v_row->>'supplier_name'),'')),
      nullif(trim(v_row->>'supplier_VATId'),''),
      nullif(trim(v_row->>'warehouse_warehouseId'),''),
      nullif(trim(v_row->>'warehouse_name'),''),
      v_issued,v_flags,v_hash,v_header_payload,now()
    )
    on conflict(source_id,external_id) do update set
      doc_number=excluded.doc_number,
      supplier_external_id=excluded.supplier_external_id,
      supplier_name=excluded.supplier_name,
      supplier_tax_id=excluded.supplier_tax_id,
      warehouse_external_id=excluded.warehouse_external_id,
      warehouse_name=excluded.warehouse_name,
      issued_date=excluded.issued_date,
      quality_flags=excluded.quality_flags,
      payload_hash=excluded.payload_hash,
      source_payload=excluded.source_payload,
      synced_at=now();

    v_line_key := coalesce(
      nullif(trim(v_row->>'items_itemId'),''),
      md5(concat_ws(
        '|',
        v_external_id,
        coalesce(v_row->>'items_product_productId',''),
        coalesce(v_row->>'items_product_sku',''),
        coalesce(v_row->>'items_quantity','')
      ))
    );

    if nullif(trim(v_row->>'items_itemId'),'') is not null
       or nullif(trim(v_row->>'items_product_productId'),'') is not null
       or nullif(trim(v_row->>'items_product_sku'),'') is not null then
      insert into integration.laudus_waybill_lines(
        organization_id,source_id,waybill_external_id,line_external_key,
        product_external_id,sku,description,quantity,unit,source_payload,synced_at
      ) values (
        p_organization_id,v_source_id,v_external_id,v_line_key,
        nullif(trim(v_row->>'items_product_productId'),''),
        nullif(trim(v_row->>'items_product_sku'),''),
        nullif(trim(v_row->>'items_product_description'),''),
        nullif(v_row->>'items_quantity','')::numeric,
        nullif(trim(v_row->>'items_product_unitOfMeasure'),''),
        v_row,now()
      )
      on conflict(source_id,waybill_external_id,line_external_key) do update set
        product_external_id=excluded.product_external_id,
        sku=excluded.sku,
        description=excluded.description,
        quantity=excluded.quantity,
        unit=excluded.unit,
        source_payload=excluded.source_payload,
        synced_at=now();
      v_lines := v_lines + 1;
    end if;

    v_rows := v_rows + 1;
  end loop;

  return jsonb_build_object(
    'rows',v_rows,
    'lines',v_lines,
    'distinct_documents_in_batch',
    (
      select count(distinct value->>'purchaseWaybillId')
      from jsonb_array_elements(p_rows)
      where nullif(trim(value->>'purchaseWaybillId'),'') is not null
    )
  );
end;
$$;

revoke all on function public.motil_ingest_laudus_waybill_rows(uuid,jsonb)
from public, anon, authenticated;
grant execute on function public.motil_ingest_laudus_waybill_rows(uuid,jsonb)
to service_role;

update integration.laudus_waybills
set source_payload = source_payload - array[
  'items_itemId',
  'items_product_productId',
  'items_product_sku',
  'items_product_description',
  'items_product_unitOfMeasure',
  'items_itemDescription',
  'items_quantity',
  'items_originalUnitCost',
  'items_currencyCode',
  'items_parityToMainCurrency',
  'items_unitCost',
  'items_costCenter_costCenterId'
]
where source_payload ?| array[
  'items_itemId',
  'items_product_productId',
  'items_product_sku',
  'items_quantity'
];
