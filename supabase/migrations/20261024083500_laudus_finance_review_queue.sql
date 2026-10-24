-- Read-only finance review queue powered by Laudus staging.
-- No payment, approval or canonical procurement mutation.

create or replace function public.motil_laudus_finance_review_queue(
  p_organization_id uuid,
  p_limit integer default 50
)
returns jsonb
language sql
security definer
set search_path = public, integration, pg_temp
as $$
with ap as (
  select *
  from integration.laudus_purchase_invoice_payment_status_v1
  where organization_id = p_organization_id
),
trace_coverage as (
  select public.motil_laudus_invoice_trace_coverage(p_organization_id) as payload
),
summary as (
  select
    count(*)::bigint as invoice_count,
    count(*) filter (where coalesce(outstanding_amount,0) > 0)::bigint as open_count,
    coalesce(sum(outstanding_amount) filter (where coalesce(outstanding_amount,0) > 0),0) as open_amount,
    count(*) filter (
      where coalesce(outstanding_amount,0) > 0
        and due_date is not null
        and due_date < current_date
    )::bigint as overdue_count,
    coalesce(sum(outstanding_amount) filter (
      where coalesce(outstanding_amount,0) > 0
        and due_date is not null
        and due_date < current_date
    ),0) as overdue_amount,
    count(*) filter (
      where coalesce(outstanding_amount,0) > 0
        and due_date is null
    )::bigint as no_due_date_count
  from ap
),
reviews as (
  select jsonb_agg(to_jsonb(q) order by q.priority_rank, q.outstanding_amount desc, q.issued_date)
  from (
    select
      purchase_invoice_external_id,
      laudus_purchase_invoice_id,
      doc_number,
      supplier_external_id,
      supplier_name,
      issued_date,
      due_date,
      total_amount,
      paid_amount,
      outstanding_amount,
      currency,
      payment_count,
      last_payment_at,
      payment_status,
      greatest((current_date - due_date::date), 0) as days_overdue,
      case
        when coalesce(outstanding_amount,0) <= 0 then 5
        when due_date is not null and due_date < current_date then 1
        when due_date is null then 2
        when due_date::date <= current_date + 7 then 3
        else 4
      end as priority_rank,
      case
        when coalesce(outstanding_amount,0) <= 0 then 'Sin acción'
        when due_date is not null and due_date < current_date then 'Vencida'
        when due_date is null then 'Falta vencimiento'
        when due_date::date <= current_date + 7 then 'Vence pronto'
        else 'Abierta'
      end as review_reason
    from ap
    where coalesce(outstanding_amount,0) > 0
    order by
      case
        when due_date is not null and due_date < current_date then 1
        when due_date is null then 2
        when due_date::date <= current_date + 7 then 3
        else 4
      end,
      outstanding_amount desc,
      issued_date
    limit least(greatest(coalesce(p_limit,50),1),100)
  ) q
),
supplier_exposure as (
  select jsonb_agg(to_jsonb(s) order by s.outstanding_amount desc)
  from (
    select
      supplier_external_id,
      max(supplier_name) as supplier_name,
      count(*) filter (where coalesce(outstanding_amount,0)>0)::bigint as open_invoices,
      count(*) filter (
        where coalesce(outstanding_amount,0)>0
          and due_date is not null
          and due_date < current_date
      )::bigint as overdue_invoices,
      coalesce(sum(outstanding_amount) filter (where coalesce(outstanding_amount,0)>0),0) as outstanding_amount,
      coalesce(sum(outstanding_amount) filter (
        where coalesce(outstanding_amount,0)>0
          and due_date is not null
          and due_date < current_date
      ),0) as overdue_amount,
      max(currency) as currency
    from ap
    where supplier_external_id is not null
    group by supplier_external_id
    having coalesce(sum(outstanding_amount) filter (where coalesce(outstanding_amount,0)>0),0) > 0
    order by outstanding_amount desc
    limit 10
  ) s
)
select jsonb_build_object(
  'source','Laudus',
  'read_only',true,
  'summary',(select to_jsonb(summary) from summary),
  'trace_coverage',(select payload from trace_coverage),
  'reviews',coalesce((select jsonb_agg from reviews),'[]'::jsonb),
  'supplier_exposure',coalesce((select jsonb_agg from supplier_exposure),'[]'::jsonb),
  'canonical_mutated',false,
  'laudus_mutated',false
);
$$;

revoke all on function public.motil_laudus_finance_review_queue(uuid,integer) from public;
grant execute on function public.motil_laudus_finance_review_queue(uuid,integer) to service_role;

comment on function public.motil_laudus_finance_review_queue(uuid,integer) is
  'Read-only Laudus AP review queue for MOTIL Finance. Prioritizes exceptions without approving or recording payments.';
