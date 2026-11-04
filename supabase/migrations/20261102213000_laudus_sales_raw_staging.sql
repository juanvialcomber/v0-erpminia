-- Atomic raw staging for Laudus sales-domain evidence.
-- No canonical MOTIL entity is mutated by this function.

create or replace function public.motil_ingest_laudus_sales_raw(
  p_organization_id uuid,
  p_entity_type text,
  p_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, pg_temp
as $$
declare
  v_source_id uuid;
  v_now timestamptz := now();
  v_inserted integer := 0;
  v_unchanged integer := 0;
begin
  if p_entity_type not in (
    'sales_customer',
    'sales_salesman',
    'sales_order',
    'sales_invoice',
    'sales_waybill',
    'sales_receipt'
  ) then
    raise exception 'invalid Laudus sales entity type';
  end if;

  select id into v_source_id
  from integration.external_sources
  where organization_id = p_organization_id
    and source_key = 'laudus'
    and enabled = true
  limit 1;

  if v_source_id is null then
    raise exception 'enabled Laudus source not found';
  end if;

  with incoming as (
    select
      x as payload,
      case p_entity_type
        when 'sales_customer' then nullif(x->>'customerId','')
        when 'sales_salesman' then nullif(x->>'salesmanId','')
        when 'sales_order' then nullif(x->>'salesOrderId','')
        when 'sales_invoice' then nullif(x->>'salesInvoiceId','')
        when 'sales_waybill' then nullif(x->>'salesWaybillId','')
        when 'sales_receipt' then nullif(x->>'receiptId','')
      end as external_id,
      coalesce(
        nullif(x->>'modifiedAt','')::timestamptz,
        nullif(x->>'issuedDate','')::timestamptz,
        nullif(x->>'createdAt','')::timestamptz,
        v_now
      ) as source_updated_at,
      md5(x::text) as payload_hash
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  ),
  valid as (
    select * from incoming where external_id is not null
  ),
  unchanged as (
    select count(*)::integer as count
    from valid v
    join integration.raw_records r
      on r.source_id = v_source_id
     and r.entity_type = p_entity_type
     and r.external_id = v.external_id
     and r.payload_hash = v.payload_hash
  )
  select count into v_unchanged from unchanged;

  update integration.raw_records r
  set is_current = false
  where r.source_id = v_source_id
    and r.entity_type = p_entity_type
    and r.is_current = true
    and exists (
      select 1
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
      where case p_entity_type
        when 'sales_customer' then nullif(x->>'customerId','')
        when 'sales_salesman' then nullif(x->>'salesmanId','')
        when 'sales_order' then nullif(x->>'salesOrderId','')
        when 'sales_invoice' then nullif(x->>'salesInvoiceId','')
        when 'sales_waybill' then nullif(x->>'salesWaybillId','')
        when 'sales_receipt' then nullif(x->>'receiptId','')
      end = r.external_id
      and md5(x::text) <> r.payload_hash
    );

  insert into integration.raw_records(
    organization_id,
    source_id,
    entity_type,
    external_id,
    source_updated_at,
    observed_at,
    payload_hash,
    payload,
    is_current,
    created_at
  )
  select
    p_organization_id,
    v_source_id,
    p_entity_type,
    case p_entity_type
      when 'sales_customer' then x->>'customerId'
      when 'sales_salesman' then x->>'salesmanId'
      when 'sales_order' then x->>'salesOrderId'
      when 'sales_invoice' then x->>'salesInvoiceId'
      when 'sales_waybill' then x->>'salesWaybillId'
      when 'sales_receipt' then x->>'receiptId'
    end,
    coalesce(
      nullif(x->>'modifiedAt','')::timestamptz,
      nullif(x->>'issuedDate','')::timestamptz,
      nullif(x->>'createdAt','')::timestamptz,
      v_now
    ),
    v_now,
    md5(x::text),
    x,
    true,
    v_now
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  where case p_entity_type
      when 'sales_customer' then nullif(x->>'customerId','')
      when 'sales_salesman' then nullif(x->>'salesmanId','')
      when 'sales_order' then nullif(x->>'salesOrderId','')
      when 'sales_invoice' then nullif(x->>'salesInvoiceId','')
      when 'sales_waybill' then nullif(x->>'salesWaybillId','')
      when 'sales_receipt' then nullif(x->>'receiptId','')
    end is not null
  on conflict (source_id, entity_type, external_id, payload_hash) do update set
    observed_at = excluded.observed_at,
    source_updated_at = excluded.source_updated_at,
    payload = excluded.payload,
    is_current = true;

  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'entity_type', p_entity_type,
    'processed', jsonb_array_length(coalesce(p_rows, '[]'::jsonb)),
    'upserted', v_inserted,
    'unchanged', v_unchanged,
    'canonical_mutated', false,
    'laudus_mutated', false
  );
end;
$$;

revoke all on function public.motil_ingest_laudus_sales_raw(uuid,text,jsonb)
from public, anon, authenticated;
grant execute on function public.motil_ingest_laudus_sales_raw(uuid,text,jsonb)
to service_role;
