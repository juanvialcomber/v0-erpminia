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
