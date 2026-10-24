-- Read-only Laudus intelligence for canonical supplier profiles.
-- Price movement is descriptive evidence, never an automatic anomaly/fraud decision.

create or replace function public.motil_laudus_supplier_intelligence(
  p_organization_id uuid,
  p_canonical_supplier_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, integration, pg_temp
as $$
with mapped as (
  select external_id
  from integration.laudus_suppliers
  where organization_id=p_organization_id
    and canonical_supplier_id=p_canonical_supplier_id
),
invoices as (
  select i.*
  from integration.laudus_purchase_invoices i
  join mapped m on m.external_id=i.supplier_external_id
  where i.organization_id=p_organization_id
),
ap as (
  select p.*
  from integration.laudus_purchase_invoice_payment_status_v1 p
  join mapped m on m.external_id=p.supplier_external_id
  where p.organization_id=p_organization_id
),
line_base as (
  select
    l.product_external_id,
    coalesce(l.sku,'') as sku,
    coalesce(l.description,'') as description,
    coalesce(l.unit,'') as unit,
    l.unit_price,
    l.quantity,
    l.line_total,
    i.issued_date,
    i.doc_number,
    row_number() over (
      partition by l.product_external_id,coalesce(l.unit,'')
      order by i.issued_date desc nulls last,i.laudus_purchase_invoice_id desc,l.id desc
    ) as recency_rank
  from integration.laudus_purchase_invoice_lines l
  join invoices i on i.external_id=l.invoice_external_id
  where l.organization_id=p_organization_id
    and l.product_external_id is not null
    and coalesce(l.unit_price,0)>0
    and coalesce(l.quantity,0)>0
),
series as (
  select
    product_external_id,
    max(sku) filter (where sku<>'') as sku,
    max(description) filter (where description<>'') as description,
    unit,
    count(*) as purchase_count,
    min(issued_date) as first_purchase_date,
    max(issued_date) as last_purchase_date,
    max(unit_price) filter (where recency_rank=1) as latest_unit_price,
    percentile_cont(0.5) within group (order by unit_price)
      filter (where recency_rank>1) as prior_median_unit_price,
    count(*) filter (where recency_rank>1) as baseline_count,
    sum(line_total) as historical_spend
  from line_base
  group by product_external_id,unit
),
movements as (
  select
    product_external_id,sku,description,unit,purchase_count,
    first_purchase_date,last_purchase_date,
    latest_unit_price,prior_median_unit_price,baseline_count,historical_spend,
    case when prior_median_unit_price is null or prior_median_unit_price=0 then null
      else round(((latest_unit_price/prior_median_unit_price)-1)*100,2)
    end as price_change_pct
  from series
),
summary as (
  select jsonb_build_object(
    'mapped_external_ids',(select count(*) from mapped),
    'invoice_count',(select count(*) from invoices),
    'purchase_spend',coalesce((select sum(total_amount) from invoices where currency='CLP'),0),
    'first_invoice_date',(select min(issued_date) from invoices),
    'last_invoice_date',(select max(issued_date) from invoices),
    'distinct_products',(select count(distinct product_external_id) from line_base),
    'open_invoice_count',(select count(*) from ap where coalesce(outstanding_amount,0)>0),
    'open_amount',coalesce((select sum(outstanding_amount) from ap where coalesce(outstanding_amount,0)>0 and currency='CLP'),0),
    'overdue_invoice_count',(select count(*) from ap where coalesce(outstanding_amount,0)>0 and due_date is not null and due_date<current_date),
    'overdue_amount',coalesce((select sum(outstanding_amount) from ap where coalesce(outstanding_amount,0)>0 and due_date is not null and due_date<current_date and currency='CLP'),0)
  ) payload
),
price_movements as (
  select coalesce(jsonb_agg(to_jsonb(x) order by abs(x.price_change_pct) desc nulls last,x.historical_spend desc),'[]'::jsonb) payload
  from (
    select *
    from movements
    where baseline_count>=2 and price_change_pct is not null
    order by abs(price_change_pct) desc,historical_spend desc
    limit 20
  ) x
),
recent_invoices as (
  select coalesce(jsonb_agg(to_jsonb(x) order by x.issued_date desc),'[]'::jsonb) payload
  from (
    select
      i.external_id,i.doc_number,i.issued_date,i.due_date,i.total_amount,i.currency,
      p.paid_amount,p.outstanding_amount,p.payment_status
    from invoices i
    left join integration.laudus_purchase_invoice_payment_status_v1 p
      on p.organization_id=i.organization_id
     and p.purchase_invoice_external_id=i.external_id
    order by i.issued_date desc nulls last
    limit 20
  ) x
)
select jsonb_build_object(
  'source','Laudus',
  'read_only',true,
  'summary',(select payload from summary),
  'price_movements',(select payload from price_movements),
  'recent_invoices',(select payload from recent_invoices),
  'canonical_mutated',false,
  'laudus_mutated',false
);
$$;

revoke all on function public.motil_laudus_supplier_intelligence(uuid,uuid) from public;
grant execute on function public.motil_laudus_supplier_intelligence(uuid,uuid) to service_role;

comment on function public.motil_laudus_supplier_intelligence(uuid,uuid) is
  'Read-only supplier intelligence from Laudus: AP exposure, invoice history and descriptive price movements versus prior median.';
