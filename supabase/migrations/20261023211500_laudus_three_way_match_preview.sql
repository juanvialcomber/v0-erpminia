-- Additive query support for bounded Laudus procurement intelligence.
create index if not exists idx_laudus_po_match
  on integration.laudus_purchase_orders (organization_id, supplier_tax_id, issued_date, external_id);
create index if not exists idx_laudus_po_lines_match
  on integration.laudus_purchase_order_lines (organization_id, purchase_order_external_id, product_external_id);
create index if not exists idx_laudus_invoice_match
  on integration.laudus_purchase_invoices (organization_id, supplier_tax_id, issued_date, external_id);
create index if not exists idx_laudus_invoice_lines_match
  on integration.laudus_purchase_invoice_lines (organization_id, invoice_external_id, product_external_id);
create index if not exists idx_laudus_waybill_match
  on integration.laudus_waybills (organization_id, supplier_tax_id, issued_date, external_id);
create index if not exists idx_laudus_waybill_lines_match
  on integration.laudus_waybill_lines (organization_id, waybill_external_id, product_external_id);

CREATE OR REPLACE FUNCTION public.motil_laudus_three_way_match_preview(p_organization_id uuid, p_scope_days integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'integration', 'pg_temp'
AS $function$
with
params as (
  select greatest(30, least(coalesce(p_scope_days,120),365))::int scope_days
),
orders as (
  select po.organization_id, po.external_id order_id, po.order_number,
         po.supplier_tax_id, po.warehouse_external_id, po.issued_date order_date,
         l.id order_line_id, l.product_external_id, l.sku, l.description,
         l.quantity order_qty, l.unit_price order_price
  from integration.laudus_purchase_orders po
  join integration.laudus_purchase_order_lines l
    on l.organization_id=po.organization_id
   and l.purchase_order_external_id=po.external_id
  where po.organization_id=p_organization_id
    and po.issued_date between current_date-(select scope_days from params)*interval '1 day'
                           and current_date+interval '1 day'
    and not ('future_issued_date'=any(po.quality_flags))
),
waybill_lines as (
  select wb.organization_id, wb.external_id waybill_id, wb.doc_number waybill_number,
         wb.supplier_tax_id, wb.warehouse_external_id, wb.issued_date waybill_date,
         l.id waybill_line_id, l.product_external_id, l.quantity waybill_qty
  from integration.laudus_waybills wb
  join integration.laudus_waybill_lines l
    on l.organization_id=wb.organization_id
   and l.waybill_external_id=wb.external_id
  where wb.organization_id=p_organization_id
    and wb.issued_date between current_date-(select scope_days from params)*interval '1 day'
                           and current_date+interval '1 day'
    and not ('future_issued_date'=any(wb.quality_flags))
),
invoice_lines as (
  select inv.organization_id, inv.external_id invoice_id, inv.doc_number invoice_number,
         inv.supplier_name, inv.supplier_tax_id, inv.warehouse_external_id,
         inv.issued_date invoice_date, l.id invoice_line_id, l.product_external_id,
         l.sku, l.description, l.quantity invoice_qty, l.unit_price invoice_price
  from integration.laudus_purchase_invoices inv
  join integration.laudus_purchase_invoice_lines l
    on l.organization_id=inv.organization_id
   and l.invoice_external_id=inv.external_id
  where inv.organization_id=p_organization_id
    and inv.issued_date between current_date-(select scope_days from params)*interval '1 day'
                            and current_date+interval '1 day'
    and not ('future_issued_date'=any(inv.quality_flags))
),
invoice_candidate_lines as (
  select i.*,
         o.order_id,o.order_number,o.order_line_id,o.order_date,o.order_qty,o.order_price,
         (
           60
           +case
             when i.invoice_qty is not null and o.order_qty is not null and i.invoice_qty=o.order_qty then 15
             when i.invoice_qty is not null and o.order_qty is not null
                  and abs(i.invoice_qty-o.order_qty)<=greatest(0.01,abs(i.invoice_qty)*0.02) then 8
             else 0
           end
           +case
             when i.invoice_price is not null and o.order_price is not null
                  and abs(i.invoice_price-o.order_price)<=greatest(1,abs(i.invoice_price)*0.005) then 15
             when i.invoice_price is not null and o.order_price is not null
                  and abs(i.invoice_price-o.order_price)<=greatest(1,abs(i.invoice_price)*0.05) then 8
             else 0
           end
           +case
             when i.warehouse_external_id is not null and i.warehouse_external_id=o.warehouse_external_id then 5
             when i.warehouse_external_id is null then 2 else 0
           end
           +case
             when abs(i.invoice_date::date-o.order_date::date)<=7 then 5
             when abs(i.invoice_date::date-o.order_date::date)<=30 then 3 else 1
           end
         )::int score,
         jsonb_build_object(
           'supplier_tax_id',true,'product_external_id',true,
           'quantity_exact',i.invoice_qty is not null and o.order_qty is not null and i.invoice_qty=o.order_qty,
           'price_within_0_5_pct',i.invoice_price is not null and o.order_price is not null
             and abs(i.invoice_price-o.order_price)<=greatest(1,abs(i.invoice_price)*0.005),
           'warehouse_exact',i.warehouse_external_id is not null and i.warehouse_external_id=o.warehouse_external_id,
           'day_gap',(i.invoice_date::date-o.order_date::date)
         ) evidence
  from invoice_lines i
  join orders o
    on o.organization_id=i.organization_id
   and o.supplier_tax_id=i.supplier_tax_id
   and o.product_external_id=i.product_external_id
   and i.invoice_date between o.order_date-interval '3 days' and o.order_date+interval '45 days'
),
invoice_candidate_orders as (
  select distinct on (invoice_line_id,order_id)
         invoice_id,invoice_number,supplier_name,invoice_date,invoice_line_id,product_external_id,sku,description,
         invoice_qty,invoice_price,order_id,order_number,order_line_id,order_date,order_qty,order_price,score,evidence
  from invoice_candidate_lines
  order by invoice_line_id,order_id,score desc,abs(invoice_date::date-order_date::date),order_line_id
),
invoice_ranked as (
  select c.*,
         row_number() over(partition by invoice_line_id order by score desc,abs(invoice_date::date-order_date::date),order_id) candidate_rank,
         lead(score) over(partition by invoice_line_id order by score desc,abs(invoice_date::date-order_date::date),order_id) next_score
  from invoice_candidate_orders c
),
invoice_best as (
  select i.invoice_id,i.invoice_number,i.supplier_name,i.invoice_date,i.invoice_line_id,
         i.product_external_id,i.sku,i.description,i.invoice_qty,i.invoice_price,
         r.order_id,r.order_number,r.order_line_id,r.score,r.next_score,r.evidence,
         case
           when r.order_id is null then 'unmatched'
           when r.score>=90 and (r.next_score is null or r.score-r.next_score>=10) then 'exact_candidate'
           when r.score>=80 and (r.next_score is null or r.score-r.next_score>=10) then 'probable'
           when r.next_score is not null and r.score-r.next_score<10 then 'ambiguous'
           else 'review'
         end match_status
  from invoice_lines i
  left join invoice_ranked r on r.invoice_line_id=i.invoice_line_id and r.candidate_rank=1
),
waybill_candidate_lines as (
  select w.*,o.order_id,o.order_number,o.order_line_id,o.order_date,o.order_qty,
         (
           60
           +case
             when w.waybill_qty is not null and o.order_qty is not null and w.waybill_qty=o.order_qty then 20
             when w.waybill_qty is not null and o.order_qty is not null
                  and abs(w.waybill_qty-o.order_qty)<=greatest(0.01,abs(w.waybill_qty)*0.02) then 10
             else 0
           end
           +case
             when w.warehouse_external_id is not null and w.warehouse_external_id=o.warehouse_external_id then 10
             when w.warehouse_external_id is null then 4 else 0
           end
           +case
             when w.waybill_date::date-o.order_date::date between 0 and 7 then 10
             when w.waybill_date::date-o.order_date::date between 0 and 30 then 6 else 2
           end
         )::int score,
         jsonb_build_object(
           'supplier_tax_id',true,'product_external_id',true,
           'quantity_exact',w.waybill_qty is not null and o.order_qty is not null and w.waybill_qty=o.order_qty,
           'warehouse_exact',w.warehouse_external_id is not null and w.warehouse_external_id=o.warehouse_external_id,
           'day_gap',(w.waybill_date::date-o.order_date::date)
         ) evidence
  from waybill_lines w
  join orders o
    on o.organization_id=w.organization_id
   and o.supplier_tax_id=w.supplier_tax_id
   and o.product_external_id=w.product_external_id
   and w.waybill_date between o.order_date and o.order_date+interval '60 days'
),
waybill_candidate_orders as (
  select distinct on (waybill_line_id,order_id)
         waybill_id,waybill_number,waybill_date,waybill_line_id,product_external_id,waybill_qty,
         order_id,order_number,order_line_id,order_date,order_qty,score,evidence
  from waybill_candidate_lines
  order by waybill_line_id,order_id,score desc,(waybill_date::date-order_date::date),order_line_id
),
waybill_ranked as (
  select c.*,
         row_number() over(partition by waybill_line_id order by score desc,(waybill_date::date-order_date::date),order_id) candidate_rank,
         lead(score) over(partition by waybill_line_id order by score desc,(waybill_date::date-order_date::date),order_id) next_score
  from waybill_candidate_orders c
),
waybill_best as (
  select w.waybill_id,w.waybill_number,w.waybill_date,w.waybill_line_id,w.product_external_id,w.waybill_qty,
         r.order_id,r.order_number,r.order_line_id,r.score,r.next_score,r.evidence,
         case
           when r.order_id is null then 'unmatched'
           when r.score>=90 and (r.next_score is null or r.score-r.next_score>=10) then 'exact_candidate'
           when r.score>=80 and (r.next_score is null or r.score-r.next_score>=10) then 'probable'
           when r.next_score is not null and r.score-r.next_score<10 then 'ambiguous'
           else 'review'
         end match_status
  from waybill_lines w
  left join waybill_ranked r on r.waybill_line_id=w.waybill_line_id and r.candidate_rank=1
),
invoice_three_way as (
  select ib.*,
         exists(
           select 1 from waybill_best wb
           where wb.order_id=ib.order_id
             and wb.product_external_id=ib.product_external_id
             and wb.match_status in ('exact_candidate','probable')
         ) has_receipt_candidate
  from invoice_best ib
),
summary as (
  select count(*) total_invoice_lines,
         count(*) filter(where match_status='exact_candidate') exact_invoice_lines,
         count(*) filter(where match_status='probable') probable_invoice_lines,
         count(*) filter(where match_status='ambiguous') ambiguous_invoice_lines,
         count(*) filter(where match_status='review') review_invoice_lines,
         count(*) filter(where match_status='unmatched') unmatched_invoice_lines,
         count(*) filter(where match_status in ('exact_candidate','probable') and has_receipt_candidate) three_way_lines
  from invoice_three_way
),
waybill_summary as (
  select count(*) total_waybill_lines,
         count(*) filter(where match_status='exact_candidate') exact_waybill_lines,
         count(*) filter(where match_status='probable') probable_waybill_lines,
         count(*) filter(where match_status='ambiguous') ambiguous_waybill_lines,
         count(*) filter(where match_status='review') review_waybill_lines,
         count(*) filter(where match_status='unmatched') unmatched_waybill_lines
  from waybill_best
),
recent_review as (
  select invoice_id,invoice_number,supplier_name,invoice_date,invoice_line_id,sku,description,
         invoice_qty,invoice_price,order_id,order_number,score,next_score,evidence,match_status,has_receipt_candidate
  from invoice_three_way
  where match_status in ('ambiguous','review','unmatched')
  order by invoice_date desc nulls last,invoice_id,invoice_line_id
  limit 15
)
select jsonb_build_object(
  'scope_days',(select scope_days from params),
  'invoice_lines',to_jsonb(summary),
  'waybill_lines',to_jsonb(waybill_summary),
  'recent_review',coalesce((select jsonb_agg(to_jsonb(recent_review)) from recent_review),'[]'::jsonb),
  'policy','candidate_only',
  'score_model','rank by distinct purchase order: supplier+product+quantity+price+warehouse+time; ambiguity gap >= 10'
)
from summary,waybill_summary;
$function$


revoke all on function public.motil_laudus_three_way_match_preview(uuid,integer) from public,anon,authenticated;
grant execute on function public.motil_laudus_three_way_match_preview(uuid,integer) to service_role;

comment on function public.motil_laudus_three_way_match_preview(uuid,integer) is
  'Read-only line-level Laudus three-way matching preview. Ranks distinct purchase-order candidates with evidence and ambiguity margin; never mutates canonical MOTIL data.';
