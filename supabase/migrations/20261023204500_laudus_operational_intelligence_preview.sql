-- Read-only operational intelligence preview for Laudus procurement.
-- Builds document-chain evidence without mutating canonical MOTIL data.

create or replace function public.motil_laudus_operational_intelligence_preview(
  p_organization_id uuid,
  p_scope_days integer default 120
)
returns jsonb
language sql
security definer
set search_path = public, integration, pg_temp
as $function$
with
params as (
  select greatest(30, least(coalesce(p_scope_days, 120), 365))::int as scope_days
),
orders as (
  select
    po.organization_id,
    po.external_id as order_id,
    po.supplier_tax_id,
    po.warehouse_external_id,
    po.issued_date as order_date,
    l.id as line_id,
    l.product_external_id,
    l.quantity,
    l.unit_price
  from integration.laudus_purchase_orders po
  join integration.laudus_purchase_order_lines l
    on l.organization_id = po.organization_id
   and l.purchase_order_external_id = po.external_id
  where po.organization_id = p_organization_id
    and po.issued_date between current_date - (select scope_days from params) * interval '1 day'
                           and current_date + interval '1 day'
    and not ('future_issued_date' = any(po.quality_flags))
),
invoice_lines as (
  select
    inv.organization_id,
    inv.external_id as invoice_id,
    inv.doc_number,
    inv.supplier_name,
    inv.supplier_tax_id,
    inv.warehouse_external_id,
    inv.issued_date as invoice_date,
    l.id as line_id,
    l.product_external_id,
    l.quantity,
    l.unit_price
  from integration.laudus_purchase_invoices inv
  join integration.laudus_purchase_invoice_lines l
    on l.organization_id = inv.organization_id
   and l.invoice_external_id = inv.external_id
  where inv.organization_id = p_organization_id
    and inv.issued_date between current_date - (select scope_days from params) * interval '1 day'
                            and current_date + interval '1 day'
    and not ('future_issued_date' = any(inv.quality_flags))
),
invoice_counts as (
  select
    i.invoice_id,
    i.doc_number,
    i.supplier_name,
    i.invoice_date,
    i.line_id,
    count(o.line_id) as candidate_count,
    count(o.line_id) filter (
      where i.unit_price is not null
        and o.unit_price is not null
        and abs(i.unit_price - o.unit_price) <= greatest(1, abs(i.unit_price) * 0.005)
    ) as exact_price_count
  from invoice_lines i
  left join orders o
    on o.organization_id = i.organization_id
   and o.supplier_tax_id = i.supplier_tax_id
   and o.product_external_id = i.product_external_id
   and coalesce(o.quantity, -1) = coalesce(i.quantity, -1)
   and (i.warehouse_external_id is null or o.warehouse_external_id = i.warehouse_external_id)
   and i.invoice_date between o.order_date - interval '3 days' and o.order_date + interval '45 days'
  group by i.invoice_id, i.doc_number, i.supplier_name, i.invoice_date, i.line_id
),
invoice_docs as (
  select
    invoice_id,
    max(doc_number) as doc_number,
    max(supplier_name) as supplier_name,
    max(invoice_date) as issued_date,
    count(*) as lines,
    count(*) filter (where exact_price_count = 1) as exact_lines,
    count(*) filter (where exact_price_count > 1) as ambiguous_lines,
    count(*) filter (where candidate_count > 0 and exact_price_count = 0) as price_review_lines,
    count(*) filter (where candidate_count = 0) as unmatched_lines
  from invoice_counts
  group by invoice_id
),
waybill_lines as (
  select
    wb.organization_id,
    wb.external_id as waybill_id,
    wb.doc_number,
    wb.supplier_name,
    wb.supplier_tax_id,
    wb.warehouse_external_id,
    wb.issued_date as waybill_date,
    l.id as line_id,
    l.product_external_id,
    l.quantity
  from integration.laudus_waybills wb
  join integration.laudus_waybill_lines l
    on l.organization_id = wb.organization_id
   and l.waybill_external_id = wb.external_id
  where wb.organization_id = p_organization_id
    and wb.issued_date between current_date - (select scope_days from params) * interval '1 day'
                           and current_date + interval '1 day'
    and not ('future_issued_date' = any(wb.quality_flags))
),
waybill_counts as (
  select
    w.waybill_id,
    w.doc_number,
    w.supplier_name,
    w.waybill_date,
    w.line_id,
    count(o.line_id) as candidate_count
  from waybill_lines w
  left join orders o
    on o.organization_id = w.organization_id
   and o.supplier_tax_id = w.supplier_tax_id
   and o.product_external_id = w.product_external_id
   and coalesce(o.quantity, -1) = coalesce(w.quantity, -1)
   and (w.warehouse_external_id is null or o.warehouse_external_id = w.warehouse_external_id)
   and w.waybill_date between o.order_date and o.order_date + interval '60 days'
  group by w.waybill_id, w.doc_number, w.supplier_name, w.waybill_date, w.line_id
),
waybill_docs as (
  select
    waybill_id,
    max(doc_number) as doc_number,
    max(supplier_name) as supplier_name,
    max(waybill_date) as issued_date,
    count(*) as lines,
    count(*) filter (where candidate_count = 1) as exact_lines,
    count(*) filter (where candidate_count > 1) as ambiguous_lines,
    count(*) filter (where candidate_count = 0) as unmatched_lines
  from waybill_counts
  group by waybill_id
),
exceptions as (
  select *
  from (
    select
      'invoice'::text as document_type,
      invoice_id as external_id,
      doc_number,
      supplier_name,
      issued_date,
      case
        when ambiguous_lines > 0 then 'ambiguous'
        when price_review_lines > 0 then 'price_review'
        when unmatched_lines > 0 then 'unmatched'
        else 'exact_candidate'
      end as status,
      unmatched_lines,
      ambiguous_lines,
      price_review_lines
    from invoice_docs
    where ambiguous_lines > 0 or price_review_lines > 0 or unmatched_lines > 0

    union all

    select
      'waybill'::text as document_type,
      waybill_id as external_id,
      doc_number,
      supplier_name,
      issued_date,
      case
        when ambiguous_lines > 0 then 'ambiguous'
        when unmatched_lines > 0 then 'unmatched'
        else 'exact_candidate'
      end as status,
      unmatched_lines,
      ambiguous_lines,
      0::bigint as price_review_lines
    from waybill_docs
    where ambiguous_lines > 0 or unmatched_lines > 0
  ) x
  order by issued_date desc nulls last
  limit 12
)
select jsonb_build_object(
  'scope_days', (select scope_days from params),
  'documents', jsonb_build_object(
    'orders', (
      select count(*)
      from integration.laudus_purchase_orders
      where organization_id = p_organization_id
        and issued_date between current_date - (select scope_days from params) * interval '1 day'
                            and current_date + interval '1 day'
        and not ('future_issued_date' = any(quality_flags))
    ),
    'waybill_headers', (
      select count(*)
      from integration.laudus_waybills
      where organization_id = p_organization_id
        and issued_date between current_date - (select scope_days from params) * interval '1 day'
                            and current_date + interval '1 day'
        and not ('future_issued_date' = any(quality_flags))
    ),
    'invoice_headers', (
      select count(*)
      from integration.laudus_purchase_invoices
      where organization_id = p_organization_id
        and issued_date between current_date - (select scope_days from params) * interval '1 day'
                            and current_date + interval '1 day'
        and not ('future_issued_date' = any(quality_flags))
    )
  ),
  'invoices', jsonb_build_object(
    'with_lines', (select count(*) from invoice_docs),
    'exact_candidate', (select count(*) from invoice_docs where exact_lines = lines),
    'ambiguous', (select count(*) from invoice_docs where ambiguous_lines > 0),
    'price_review', (select count(*) from invoice_docs where price_review_lines > 0),
    'unmatched', (select count(*) from invoice_docs where unmatched_lines = lines)
  ),
  'waybills', jsonb_build_object(
    'with_lines', (select count(*) from waybill_docs),
    'exact_candidate', (select count(*) from waybill_docs where exact_lines = lines),
    'ambiguous', (select count(*) from waybill_docs where ambiguous_lines > 0),
    'unmatched', (select count(*) from waybill_docs where unmatched_lines = lines)
  ),
  'exceptions', coalesce((select jsonb_agg(to_jsonb(exceptions)) from exceptions), '[]'::jsonb),
  'policy', 'candidate_only'
);
$function$;

revoke all on function public.motil_laudus_operational_intelligence_preview(uuid, integer) from public, anon, authenticated;
grant execute on function public.motil_laudus_operational_intelligence_preview(uuid, integer) to service_role;

comment on function public.motil_laudus_operational_intelligence_preview(uuid, integer) is
  'Read-only Laudus procurement intelligence preview. Matches OC to waybill/invoice evidence conservatively using supplier RUT, product, quantity, warehouse, date and invoice price. Candidate-only; never mutates canonical MOTIL data.';
