-- Document-first reconciliation for Laudus purchase invoices.
-- Candidate-only: no canonical writes, approvals or payment actions.

create or replace function public.motil_laudus_document_match_preview(
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
  select greatest(30,least(coalesce(p_scope_days,120),365))::int scope_days
),
ih as (
  select inv.organization_id,inv.external_id invoice_id,inv.doc_number,inv.supplier_name,
         inv.supplier_tax_id,inv.warehouse_external_id,inv.issued_date invoice_date,inv.total_amount
  from integration.laudus_purchase_invoices inv
  where inv.organization_id=p_organization_id
    and inv.issued_date between current_date-(select scope_days from params)*interval '1 day'
                            and current_date+interval '1 day'
    and inv.supplier_tax_id is not null
    and not ('future_issued_date'=any(inv.quality_flags))
),
oh as (
  select po.organization_id,po.external_id order_id,po.order_number,
         po.supplier_tax_id,po.warehouse_external_id,po.issued_date order_date,po.total_amount
  from integration.laudus_purchase_orders po
  where po.organization_id=p_organization_id
    and po.issued_date between current_date-((select scope_days from params)+45)*interval '1 day'
                           and current_date+interval '1 day'
    and po.supplier_tax_id is not null
    and not ('future_issued_date'=any(po.quality_flags))
),
ip as (
  select organization_id,invoice_external_id invoice_id,product_external_id,sum(coalesce(quantity,0)) qty_sum
  from integration.laudus_purchase_invoice_lines
  where organization_id=p_organization_id and product_external_id is not null
  group by organization_id,invoice_external_id,product_external_id
),
op as (
  select organization_id,purchase_order_external_id order_id,product_external_id,sum(coalesce(quantity,0)) qty_sum
  from integration.laudus_purchase_order_lines
  where organization_id=p_organization_id and product_external_id is not null
  group by organization_id,purchase_order_external_id,product_external_id
),
isize as (
  select invoice_id,count(*) product_count from ip group by invoice_id
),
pairs as (
  select i.*,o.order_id,o.order_number,o.order_date,o.total_amount order_total,o.warehouse_external_id order_warehouse
  from ih i
  join oh o on o.organization_id=i.organization_id
   and o.supplier_tax_id=i.supplier_tax_id
   and i.invoice_date between o.order_date-interval '3 days' and o.order_date+interval '45 days'
),
ov as (
  select p.invoice_id,p.order_id,
         count(op.product_external_id) matched_products,
         count(op.product_external_id) filter(
           where abs(coalesce(ip.qty_sum,0)-coalesce(op.qty_sum,0))
             <= greatest(0.01,abs(coalesce(ip.qty_sum,0))*0.02)
         ) qty_close_products
  from pairs p
  left join ip on ip.organization_id=p.organization_id and ip.invoice_id=p.invoice_id
  left join op on op.organization_id=p.organization_id
              and op.order_id=p.order_id
              and op.product_external_id=ip.product_external_id
  group by p.invoice_id,p.order_id
),
scored as (
  select p.invoice_id,p.doc_number,p.supplier_name,p.invoice_date,p.order_id,p.order_number,p.order_date,
         coalesce(coalesce(ov.matched_products,0)::numeric/nullif(s.product_count,0),0) product_coverage,
         coalesce(coalesce(ov.qty_close_products,0)::numeric/nullif(s.product_count,0),0) qty_coverage,
         (
           40
           +round(25*coalesce(coalesce(ov.matched_products,0)::numeric/nullif(s.product_count,0),0))
           +round(15*coalesce(coalesce(ov.qty_close_products,0)::numeric/nullif(s.product_count,0),0))
           +case when p.warehouse_external_id is not null and p.warehouse_external_id=p.order_warehouse then 8
                 when p.warehouse_external_id is null then 3 else 0 end
           +case when p.total_amount is not null and p.order_total is not null
                  and abs(p.total_amount-p.order_total)<=greatest(1,abs(p.total_amount)*0.005) then 7
                 when p.total_amount is not null and p.order_total is not null
                  and abs(p.total_amount-p.order_total)<=greatest(1,abs(p.total_amount)*0.05) then 4
                 else 0 end
           +case when abs(p.invoice_date::date-p.order_date::date)<=7 then 5
                 when abs(p.invoice_date::date-p.order_date::date)<=30 then 3
                 else 1 end
         )::int score,
         jsonb_build_object(
           'supplier_tax_id',true,
           'product_coverage',coalesce(coalesce(ov.matched_products,0)::numeric/nullif(s.product_count,0),0),
           'quantity_coverage',coalesce(coalesce(ov.qty_close_products,0)::numeric/nullif(s.product_count,0),0),
           'warehouse_exact',p.warehouse_external_id is not null and p.warehouse_external_id=p.order_warehouse,
           'amount_within_0_5_pct',p.total_amount is not null and p.order_total is not null
             and abs(p.total_amount-p.order_total)<=greatest(1,abs(p.total_amount)*0.005),
           'day_gap',(p.invoice_date::date-p.order_date::date)
         ) evidence
  from pairs p
  left join ov on ov.invoice_id=p.invoice_id and ov.order_id=p.order_id
  left join isize s on s.invoice_id=p.invoice_id
),
ranked as (
  select *,
         row_number() over(partition by invoice_id order by score desc,product_coverage desc,qty_coverage desc,order_id) candidate_rank,
         lead(score) over(partition by invoice_id order by score desc,product_coverage desc,qty_coverage desc,order_id) next_score
  from scored
),
best as (
  select *,
         case
           when score>=90 and (next_score is null or score-next_score>=10) then 'exact_candidate'
           when score>=80 and (next_score is null or score-next_score>=10) then 'probable'
           when score>=70 and next_score is not null and score-next_score<10 then 'ambiguous'
           else 'review'
         end match_status
  from ranked
  where candidate_rank=1
),
summary as (
  select
    (select count(*) from ih) total_invoices,
    count(*) invoices_with_candidate,
    count(*) filter(where match_status='exact_candidate') exact_candidate,
    count(*) filter(where match_status='probable') probable,
    count(*) filter(where match_status='ambiguous') ambiguous,
    count(*) filter(where match_status='review') review,
    (select count(*) from ih)-count(*) no_order_candidate
  from best
),
recent_strong as (
  select invoice_id,doc_number,supplier_name,invoice_date,order_id,order_number,order_date,
         score,next_score,match_status,evidence
  from best
  where match_status in ('exact_candidate','probable')
  order by invoice_date desc nulls last,score desc
  limit 12
),
recent_review as (
  select invoice_id,doc_number,supplier_name,invoice_date,order_id,order_number,order_date,
         score,next_score,match_status,evidence
  from best
  where match_status in ('ambiguous','review')
  order by invoice_date desc nulls last,score desc
  limit 12
)
select jsonb_build_object(
  'scope_days',(select scope_days from params),
  'summary',to_jsonb(summary),
  'recent_strong',coalesce((select jsonb_agg(to_jsonb(recent_strong)) from recent_strong),'[]'::jsonb),
  'recent_review',coalesce((select jsonb_agg(to_jsonb(recent_review)) from recent_review),'[]'::jsonb),
  'policy','candidate_only',
  'score_model','document-first: supplier+product coverage+quantity coverage+amount+warehouse+time; strong ambiguity only when top score >= 70 and gap < 10'
)
from summary;
$function$;

revoke all on function public.motil_laudus_document_match_preview(uuid,integer) from public,anon,authenticated;
grant execute on function public.motil_laudus_document_match_preview(uuid,integer) to service_role;

comment on function public.motil_laudus_document_match_preview(uuid,integer) is
  'Read-only document-first invoice to purchase-order candidate ranking with evidence and ambiguity margin. No canonical writes.';
