-- Separate operational procurement award evidence from controlled UAT/test evidence.
-- Additive and backward-compatible: normal award decisions remain operational by default.

alter table public.procurement_award_decisions
  add column if not exists evidence_scope text not null default 'operational';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.procurement_award_decisions'::regclass
      and conname = 'procurement_award_decisions_evidence_scope_check'
  ) then
    alter table public.procurement_award_decisions
      add constraint procurement_award_decisions_evidence_scope_check
      check (evidence_scope in ('operational','uat'));
  end if;
end
$$;

create index if not exists idx_procurement_award_decisions_org_scope
  on public.procurement_award_decisions(organization_id,evidence_scope,decided_at desc);

-- Exact historical correction only for the known controlled production UAT.
update public.procurement_award_decisions
set evidence_scope = 'uat'
where id = 'a9947cdd-2ca7-4792-baff-699df5f78817'
  and organization_id = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee'
  and decision_notes = 'UAT productivo controlado: validación funcional del pipeline; no representa una compra real ni instrucción externa al proveedor.';

create or replace view public.procurement_award_outcomes_v1
with (security_invoker = true)
as
with receipt_rollup as (
  select r.organization_id,r.order_id,min(r.received_at)::date as first_receipt_date,max(r.received_at)::date as last_receipt_date,
    coalesce(sum(rl.quantity_received),0)::numeric as quantity_received,
    coalesce(sum(rl.quantity_accepted),0)::numeric as quantity_accepted,
    coalesce(sum(rl.quantity_rejected),0)::numeric as quantity_rejected
  from public.procurement_operational_receipts r
  join public.procurement_operational_receipt_lines rl on rl.receipt_id=r.id and rl.organization_id=r.organization_id
  group by r.organization_id,r.order_id
), invoice_rollup as (
  select organization_id,order_id,
    count(*) filter (where status <> 'rejected')::integer as invoice_count,
    count(*) filter (where status = 'rejected')::integer as rejected_invoice_count,
    count(*) filter (where status <> 'rejected' and approval_basis = 'matched')::integer as matched_invoice_count,
    count(*) filter (where status <> 'rejected' and approval_basis = 'accepted_exception')::integer as exception_invoice_count
  from public.procurement_supplier_invoices group by organization_id,order_id
)
select d.id as decision_id,d.organization_id,d.request_id,d.quotation_id,d.purchase_order_id,d.supplier_id,d.primary_reason,d.decision_notes,d.decided_by,d.decided_at,d.currency,d.quoted_total,d.lead_time_days,
  d.supplier_operational_score as supplier_score_at_decision,d.evidence_dimensions as evidence_dimensions_at_decision,d.is_lowest_price,d.is_fastest_delivery,
  o.order_number,o.status as order_status,o.expected_delivery_date,o.actual_delivery_date,
  case when o.actual_delivery_date is null or o.expected_delivery_date is null then null else o.actual_delivery_date <= o.expected_delivery_date end as delivered_on_time,
  case when o.actual_delivery_date is null or o.expected_delivery_date is null then null else (o.actual_delivery_date-o.expected_delivery_date) end as delivery_variance_days,
  rr.first_receipt_date,rr.last_receipt_date,rr.quantity_received,rr.quantity_accepted,rr.quantity_rejected,
  case when coalesce(rr.quantity_received,0)>0 then round((rr.quantity_accepted/rr.quantity_received)*100,2) else null end as acceptance_rate_pct,
  ir.invoice_count,ir.rejected_invoice_count,ir.matched_invoice_count,ir.exception_invoice_count,
  case when coalesce(ir.invoice_count,0)>0 then round((ir.matched_invoice_count::numeric/ir.invoice_count::numeric)*100,2) else null end as clean_invoice_rate_pct,
  case when o.status='closed' then 'closed' when o.id is null then 'missing_order' when o.actual_delivery_date is null and coalesce(rr.quantity_received,0)=0 then 'awaiting_outcome' else 'in_progress' end as outcome_state,
  d.evidence_scope
from public.procurement_award_decisions d
left join public.procurement_operational_orders o on o.id=d.purchase_order_id and o.organization_id=d.organization_id
left join receipt_rollup rr on rr.order_id=d.purchase_order_id and rr.organization_id=d.organization_id
left join invoice_rollup ir on ir.order_id=d.purchase_order_id and ir.organization_id=d.organization_id;

alter view public.procurement_award_outcomes_v1 set (security_invoker = true);
revoke all on public.procurement_award_outcomes_v1 from public,anon,authenticated;
grant select on public.procurement_award_outcomes_v1 to service_role;

create or replace view public.procurement_award_outcome_summary_v1
with (security_invoker = true)
as
select organization_id,primary_reason,count(*)::integer as decisions,
  count(*) filter (where outcome_state='closed')::integer as closed_decisions,
  count(*) filter (where is_lowest_price is true)::integer as lowest_price_decisions,
  count(*) filter (where is_lowest_price is false)::integer as non_lowest_price_decisions,
  count(*) filter (where is_fastest_delivery is true)::integer as fastest_delivery_decisions,
  count(*) filter (where is_fastest_delivery is false)::integer as non_fastest_delivery_decisions,
  count(*) filter (where delivered_on_time is true)::integer as on_time_outcomes,
  count(*) filter (where delivered_on_time is false)::integer as late_outcomes,
  round(avg(acceptance_rate_pct),2) as avg_acceptance_rate_pct,
  round(avg(clean_invoice_rate_pct),2) as avg_clean_invoice_rate_pct
from public.procurement_award_outcomes_v1
where evidence_scope = 'operational'
group by organization_id,primary_reason;

alter view public.procurement_award_outcome_summary_v1 set (security_invoker = true);
revoke all on public.procurement_award_outcome_summary_v1 from public,anon,authenticated;
grant select on public.procurement_award_outcome_summary_v1 to service_role;


-- Procurement intake scope is canonical at the origin so downstream supplier
-- performance can exclude controlled UAT without deleting its audit trail.
alter table public.procurement_intake_requests
  add column if not exists evidence_scope text not null default 'operational';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.procurement_intake_requests'::regclass
      and conname = 'procurement_intake_requests_evidence_scope_check'
  ) then
    alter table public.procurement_intake_requests
      add constraint procurement_intake_requests_evidence_scope_check
      check (evidence_scope in ('operational','uat'));
  end if;
end
$$;

create index if not exists idx_procurement_intake_requests_org_scope
  on public.procurement_intake_requests(organization_id,evidence_scope,created_at desc);

-- Exact backfill for the three known procurement UAT fixtures.
update public.procurement_intake_requests
set evidence_scope = 'uat'
where organization_id = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee'
  and (
    (id = 'c473cd51-798f-4724-b0cb-c08a1bfd2ff2' and request_number = 'PR-20260825-8927AD55')
    or
    (id = '4c31ddc3-50a3-4236-9d83-549f4a0d1d19' and request_number = 'UAT-EXC-20260828-001')
    or
    (id = '7150f4ec-19b5-412c-b505-d11c8ed55a06' and request_number = 'UAT-RET-20260829-001')
  );

-- Supplier performance must be built only from operational procurement evidence.
create or replace view intelligence.supplier_operational_score_v2
with (security_invoker=true) as
with eligible_orders as (
  select o.*
  from public.procurement_operational_orders o
  left join public.procurement_intake_requests req
    on req.organization_id=o.organization_id
   and req.id=o.intake_request_id
  where o.intake_request_id is null
     or req.evidence_scope='operational'
), order_metrics as (
  select o.organization_id,
         o.supplier_id,
         count(*) as total_orders,
         count(*) filter (where o.status in ('received','closed')) as completed_orders,
         count(*) filter (where o.status in ('received','closed') and o.expected_delivery_date is not null and o.actual_delivery_date is not null) as delivery_scored_orders,
         count(*) filter (where o.status in ('received','closed') and o.expected_delivery_date is not null and o.actual_delivery_date is not null and o.actual_delivery_date <= o.expected_delivery_date) as on_time_orders,
         max(o.actual_delivery_date) as last_delivery_date
  from eligible_orders o
  group by o.organization_id,o.supplier_id
), receipt_metrics as (
  select o.organization_id,
         o.supplier_id,
         count(distinct r.id) as receipt_count,
         coalesce(sum(rl.quantity_received),0)::numeric as quantity_received,
         coalesce(sum(rl.quantity_accepted),0)::numeric as quantity_accepted,
         coalesce(sum(rl.quantity_rejected),0)::numeric as quantity_rejected
  from eligible_orders o
  join public.procurement_operational_receipts r
    on r.organization_id=o.organization_id and r.order_id=o.id
  join public.procurement_operational_receipt_lines rl
    on rl.organization_id=r.organization_id and rl.receipt_id=r.id
  group by o.organization_id,o.supplier_id
), invoice_metrics as (
  select i.organization_id,
         i.supplier_id,
         count(*) filter (where i.status in ('matched','approved','rejected')) as invoice_scored_count,
         count(*) filter (where i.status='matched' or (i.status='approved' and i.approval_basis='matched')) as invoice_clean_match_count,
         count(*) filter (where i.status='approved' and i.approval_basis='accepted_exception') as invoice_exception_accepted_count,
         count(*) filter (where i.status='rejected') as invoice_rejected_count
  from public.procurement_supplier_invoices i
  join eligible_orders o
    on o.organization_id=i.organization_id and o.id=i.order_id
  group by i.organization_id,i.supplier_id
), return_metrics as (
  select r.organization_id,
         r.supplier_id,
         count(*) filter (where r.status<>'cancelled') as returns_count,
         count(*) filter (where r.status='resolved') as resolved_returns_count,
         coalesce(sum(rl.quantity) filter (where r.status<>'cancelled'),0)::numeric as returned_quantity
  from public.procurement_supplier_returns r
  join eligible_orders o
    on o.organization_id=r.organization_id and o.id=r.order_id
  left join public.procurement_supplier_return_lines rl
    on rl.organization_id=r.organization_id and rl.return_id=r.id
  group by r.organization_id,r.supplier_id
), base as (
  select s.organization_id,
         s.id as supplier_id,
         s.tax_id as supplier_tax_id,
         coalesce(s.trade_name,s.legal_name) as supplier_name,
         s.legal_name as supplier_legal_name,
         coalesce(o.total_orders,0) as total_orders,
         coalesce(o.completed_orders,0) as completed_orders,
         coalesce(o.delivery_scored_orders,0) as delivery_scored_orders,
         coalesce(o.on_time_orders,0) as on_time_orders,
         o.last_delivery_date,
         coalesce(r.receipt_count,0) as receipt_count,
         coalesce(r.quantity_received,0) as quantity_received,
         coalesce(r.quantity_accepted,0) as quantity_accepted,
         coalesce(r.quantity_rejected,0) as quantity_rejected,
         coalesce(i.invoice_scored_count,0) as invoice_scored_count,
         coalesce(i.invoice_clean_match_count,0) as invoice_clean_match_count,
         coalesce(i.invoice_exception_accepted_count,0) as invoice_exception_accepted_count,
         coalesce(i.invoice_rejected_count,0) as invoice_rejected_count,
         coalesce(rt.returns_count,0) as returns_count,
         coalesce(rt.resolved_returns_count,0) as resolved_returns_count,
         coalesce(rt.returned_quantity,0) as returned_quantity,
         case when coalesce(o.delivery_scored_orders,0)>0 then round(100.0*o.on_time_orders/o.delivery_scored_orders,2) end as delivery_score,
         case when coalesce(r.quantity_received,0)>0 then round(100.0*r.quantity_accepted/r.quantity_received,2) end as quality_score,
         case when coalesce(i.invoice_scored_count,0)>0 then round(100.0*i.invoice_clean_match_count/i.invoice_scored_count,2) end as invoice_score
  from canonical.suppliers s
  left join order_metrics o on o.organization_id=s.organization_id and o.supplier_id=s.id
  left join receipt_metrics r on r.organization_id=s.organization_id and r.supplier_id=s.id
  left join invoice_metrics i on i.organization_id=s.organization_id and i.supplier_id=s.id
  left join return_metrics rt on rt.organization_id=s.organization_id and rt.supplier_id=s.id
  where s.is_active=true
)
select b.*,
       ((b.delivery_score is not null)::int + (b.quality_score is not null)::int + (b.invoice_score is not null)::int) as evidence_dimensions,
       case
         when ((b.delivery_score is not null)::int + (b.quality_score is not null)::int + (b.invoice_score is not null)::int)=0 then null
         else round((coalesce(b.delivery_score,0)+coalesce(b.quality_score,0)+coalesce(b.invoice_score,0)) /
                    ((b.delivery_score is not null)::int + (b.quality_score is not null)::int + (b.invoice_score is not null)::int),2)
       end as operational_score,
       'v2_equal_available_dimensions_operational_only'::text as score_version
from base b;

create or replace view public.supplier_operational_score_v2
with (security_invoker=true) as
select * from intelligence.supplier_operational_score_v2;

revoke all on intelligence.supplier_operational_score_v2 from public,anon,authenticated;
revoke all on public.supplier_operational_score_v2 from public,anon,authenticated;
grant select on intelligence.supplier_operational_score_v2 to service_role;
grant select on public.supplier_operational_score_v2 to service_role;
