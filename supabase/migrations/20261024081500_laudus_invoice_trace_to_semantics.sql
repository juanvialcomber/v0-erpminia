-- Normalize the empty invoice trace staging to Laudus' official traceTo semantics.
-- The table has no data at migration time; rename avoids encoding the wrong direction.

alter table integration.laudus_purchase_invoice_item_traces
  rename column from_step to origin_step;
alter table integration.laudus_purchase_invoice_item_traces
  rename column from_id to origin_id;

alter table integration.laudus_purchase_invoice_item_traces
  add column if not exists origin_doc_number bigint;

drop index if exists integration.laudus_purchase_invoice_item_traces_from_idx;
create index if not exists laudus_purchase_invoice_item_traces_origin_idx
  on integration.laudus_purchase_invoice_item_traces (organization_id, origin_step, origin_id);

create or replace function public.motil_ingest_laudus_invoice_traces(
  p_organization_id uuid,
  p_invoice_external_id text,
  p_laudus_purchase_invoice_id bigint,
  p_traces jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, pg_temp
as $$
declare
  v_source_id uuid;
  v_row jsonb;
  v_count integer := 0;
begin
  select id into v_source_id
  from integration.external_sources
  where organization_id = p_organization_id
    and source_key = 'laudus'
  order by created_at
  limit 1;

  if v_source_id is null then
    raise exception 'Laudus source not configured for organization';
  end if;

  delete from integration.laudus_purchase_invoice_item_traces
  where organization_id = p_organization_id
    and invoice_external_id = p_invoice_external_id;

  for v_row in
    select value from jsonb_array_elements(coalesce(p_traces, '[]'::jsonb))
  loop
    insert into integration.laudus_purchase_invoice_item_traces (
      organization_id,
      source_id,
      invoice_external_id,
      laudus_purchase_invoice_id,
      invoice_item_id,
      trace_id,
      origin_step,
      origin_id,
      origin_doc_number,
      source_payload,
      synced_at
    ) values (
      p_organization_id,
      v_source_id,
      p_invoice_external_id,
      p_laudus_purchase_invoice_id,
      null,
      null,
      nullif(v_row->>'originStep',''),
      nullif(v_row->>'originId','')::bigint,
      nullif(v_row->>'originDocNumber','')::bigint,
      v_row,
      now()
    )
    on conflict do nothing;

    v_count := v_count + 1;
  end loop;

  insert into integration.laudus_purchase_invoice_trace_sync (
    organization_id,
    invoice_external_id,
    laudus_purchase_invoice_id,
    status,
    trace_count,
    synced_at
  ) values (
    p_organization_id,
    p_invoice_external_id,
    p_laudus_purchase_invoice_id,
    'complete',
    v_count,
    now()
  )
  on conflict (organization_id, invoice_external_id)
  do update set
    laudus_purchase_invoice_id = excluded.laudus_purchase_invoice_id,
    status = excluded.status,
    trace_count = excluded.trace_count,
    synced_at = excluded.synced_at;

  return jsonb_build_object(
    'invoice_external_id', p_invoice_external_id,
    'traces_persisted', v_count,
    'canonical_mutated', false,
    'laudus_mutated', false
  );
end;
$$;

drop view if exists integration.laudus_purchase_invoice_trace_resolution_v1;
create view integration.laudus_purchase_invoice_trace_resolution_v1 as
select
  t.organization_id,
  t.invoice_external_id,
  t.laudus_purchase_invoice_id,
  t.origin_step,
  t.origin_id,
  t.origin_doc_number,
  po.external_id as purchase_order_external_id,
  po.laudus_purchase_order_id,
  po.order_number as purchase_order_number,
  wb.external_id as waybill_external_id,
  wb.laudus_purchase_waybill_id,
  wb.doc_number as waybill_number,
  case
    when po.external_id is not null and wb.external_id is null then 'exact_purchase_order'
    when po.external_id is null and wb.external_id is not null then 'exact_waybill'
    when po.external_id is not null and wb.external_id is not null then 'ambiguous_id'
    else 'unresolved'
  end as resolution_status
from integration.laudus_purchase_invoice_item_traces t
left join integration.laudus_purchase_orders po
  on po.organization_id = t.organization_id
 and po.laudus_purchase_order_id = t.origin_id
left join integration.laudus_waybills wb
  on wb.organization_id = t.organization_id
 and wb.laudus_purchase_waybill_id = t.origin_id;

comment on view integration.laudus_purchase_invoice_trace_resolution_v1 is
  'Exact resolution of Laudus invoice traceTo origin IDs against staged purchase orders and waybills. originStep is preserved; undocumented step-code semantics are not assumed.';
