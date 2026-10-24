-- Laudus invoice line provenance.
-- Captures exact upstream traceFrom links without projecting them into MOTIL canonical procurement.

create table if not exists integration.laudus_purchase_invoice_item_traces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete cascade,
  invoice_external_id text not null,
  laudus_purchase_invoice_id bigint not null,
  invoice_item_id bigint,
  trace_id bigint,
  from_step text,
  from_id bigint,
  source_payload jsonb,
  synced_at timestamptz not null default now()
);

create unique index if not exists laudus_purchase_invoice_item_traces_uq
  on integration.laudus_purchase_invoice_item_traces (
    organization_id,
    invoice_external_id,
    coalesce(invoice_item_id, -1),
    coalesce(trace_id, -1),
    coalesce(from_step, ''),
    coalesce(from_id, -1)
  );

create index if not exists laudus_purchase_invoice_item_traces_from_idx
  on integration.laudus_purchase_invoice_item_traces (organization_id, from_step, from_id);

create table if not exists integration.laudus_purchase_invoice_trace_sync (
  organization_id uuid not null,
  invoice_external_id text not null,
  laudus_purchase_invoice_id bigint not null,
  status text not null check (status in ('complete','error')),
  trace_count integer not null default 0,
  synced_at timestamptz not null default now(),
  primary key (organization_id, invoice_external_id)
);

create or replace function public.motil_get_laudus_invoice_trace_candidates(
  p_organization_id uuid,
  p_limit integer default 10
)
returns table (
  invoice_external_id text,
  laudus_purchase_invoice_id bigint
)
language sql
security definer
set search_path = public, integration, pg_temp
as $$
  select i.external_id, i.laudus_purchase_invoice_id
  from integration.laudus_purchase_invoices i
  left join integration.laudus_purchase_invoice_trace_sync s
    on s.organization_id = i.organization_id
   and s.invoice_external_id = i.external_id
  where i.organization_id = p_organization_id
    and i.laudus_purchase_invoice_id is not null
    and s.invoice_external_id is null
  order by i.issued_date desc nulls last, i.laudus_purchase_invoice_id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$$;

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
      from_step,
      from_id,
      source_payload,
      synced_at
    ) values (
      p_organization_id,
      v_source_id,
      p_invoice_external_id,
      p_laudus_purchase_invoice_id,
      nullif(v_row->>'itemId','')::bigint,
      nullif(v_row->>'traceId','')::bigint,
      nullif(v_row->>'fromStep',''),
      nullif(v_row->>'fromId','')::bigint,
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

revoke all on function public.motil_get_laudus_invoice_trace_candidates(uuid, integer) from public;
revoke all on function public.motil_ingest_laudus_invoice_traces(uuid, text, bigint, jsonb) from public;
grant execute on function public.motil_get_laudus_invoice_trace_candidates(uuid, integer) to service_role;
grant execute on function public.motil_ingest_laudus_invoice_traces(uuid, text, bigint, jsonb) to service_role;

comment on table integration.laudus_purchase_invoice_item_traces is
  'Exact Laudus PurchaseInvoiceItemDto.traceFrom provenance. Not canonical MOTIL procurement state.';
