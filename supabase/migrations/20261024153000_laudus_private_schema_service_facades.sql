-- Service-role-only Data API facades for private Laudus/canonical evidence.
-- Keeps integration and canonical schemas unexposed while allowing trusted
-- Next.js server routes to read bounded evidence through the public Data API.

create table if not exists integration.laudus_finance_review_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  purchase_invoice_external_id text not null,
  suggested_supplier_id uuid,
  decision text not null check (decision in ('accepted','rejected','deferred')),
  reason text,
  priority_score numeric,
  outstanding_amount numeric,
  actor_user_id uuid not null,
  actor_name text,
  created_at timestamptz not null default now()
);

alter table integration.laudus_finance_review_feedback enable row level security;

create index if not exists laudus_finance_review_feedback_org_invoice_idx
  on integration.laudus_finance_review_feedback(
    organization_id,
    purchase_invoice_external_id,
    created_at desc
  );

create index if not exists laudus_finance_review_feedback_org_decision_idx
  on integration.laudus_finance_review_feedback(
    organization_id,
    decision,
    created_at desc
  );

revoke all on integration.laudus_finance_review_feedback from public, anon, authenticated;
grant select, insert on integration.laudus_finance_review_feedback to service_role;

comment on table integration.laudus_finance_review_feedback is
  'Human review labels for Laudus finance intelligence. Learning evidence only; never approves, creates or modifies canonical financial records.';

create or replace view public.laudus_purchase_invoice_payment_status_service_v1
with (security_invoker = true)
as
select
  organization_id,
  purchase_invoice_external_id,
  laudus_purchase_invoice_id,
  doc_number,
  supplier_external_id,
  supplier_name,
  issued_date,
  due_date,
  total_amount,
  currency,
  paid_amount,
  outstanding_amount,
  payment_count,
  last_payment_at,
  any_deposited,
  payment_status
from integration.laudus_purchase_invoice_payment_status_v1;

create or replace view public.laudus_purchase_invoices_service_v1
with (security_invoker = true)
as
select
  organization_id,
  external_id,
  supplier_tax_id,
  synced_at
from integration.laudus_purchase_invoices;

create or replace view public.laudus_purchase_payments_service_v1
with (security_invoker = true)
as
select
  id,
  organization_id,
  external_id,
  synced_at
from integration.laudus_purchase_payments;

create or replace view public.laudus_source_status_service_v1
with (security_invoker = true)
as
select
  s.organization_id,
  s.id as source_id,
  s.enabled,
  latest.status as latest_status,
  latest.created_at as latest_run_at
from integration.external_sources s
left join lateral (
  select r.status, r.created_at
  from integration.sync_runs r
  where r.organization_id = s.organization_id
    and r.source_id = s.id
  order by r.created_at desc
  limit 1
) latest on true
where s.source_key = 'laudus';

create or replace view public.canonical_cost_centers_service_v1
with (security_invoker = true)
as
select id, organization_id
from canonical.cost_centers;

create or replace view public.canonical_assets_service_v1
with (security_invoker = true)
as
select
  id,
  organization_id,
  acquisition_date,
  acquisition_cost,
  expected_lifespan_years
from canonical.assets;

create or replace view public.laudus_finance_review_feedback_service_v1
with (security_invoker = true)
as
select
  id,
  organization_id,
  purchase_invoice_external_id,
  suggested_supplier_id,
  decision,
  reason,
  priority_score,
  outstanding_amount,
  actor_user_id,
  actor_name,
  created_at
from integration.laudus_finance_review_feedback;

revoke all on public.laudus_purchase_invoice_payment_status_service_v1 from public, anon, authenticated;
revoke all on public.laudus_purchase_invoices_service_v1 from public, anon, authenticated;
revoke all on public.laudus_purchase_payments_service_v1 from public, anon, authenticated;
revoke all on public.laudus_source_status_service_v1 from public, anon, authenticated;
revoke all on public.canonical_cost_centers_service_v1 from public, anon, authenticated;
revoke all on public.canonical_assets_service_v1 from public, anon, authenticated;
revoke all on public.laudus_finance_review_feedback_service_v1 from public, anon, authenticated;

grant select on public.laudus_purchase_invoice_payment_status_service_v1 to service_role;
grant select on public.laudus_purchase_invoices_service_v1 to service_role;
grant select on public.laudus_purchase_payments_service_v1 to service_role;
grant select on public.laudus_source_status_service_v1 to service_role;
grant select on public.canonical_cost_centers_service_v1 to service_role;
grant select on public.canonical_assets_service_v1 to service_role;
grant select on public.laudus_finance_review_feedback_service_v1 to service_role;

create or replace function public.motil_record_laudus_finance_review_feedback(
  p_organization_id uuid,
  p_purchase_invoice_external_id text,
  p_suggested_supplier_id uuid,
  p_decision text,
  p_reason text,
  p_priority_score numeric,
  p_outstanding_amount numeric,
  p_actor_user_id uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security invoker
set search_path = public, integration, pg_temp
as $function$
declare
  v_id uuid;
begin
  if p_decision not in ('accepted','rejected','deferred') then
    raise exception 'Invalid finance review decision';
  end if;

  if p_decision = 'rejected' and nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'Reason required for rejected finance review';
  end if;

  if not exists (
    select 1
    from integration.laudus_purchase_invoice_payment_status_v1 i
    where i.organization_id = p_organization_id
      and i.purchase_invoice_external_id = p_purchase_invoice_external_id
  ) then
    raise exception 'Laudus purchase invoice outside organization scope';
  end if;

  if p_suggested_supplier_id is not null and not exists (
    select 1
    from public.suppliers s
    where s.organization_id = p_organization_id
      and s.id = p_suggested_supplier_id
  ) then
    raise exception 'Supplier outside organization scope';
  end if;

  insert into integration.laudus_finance_review_feedback(
    organization_id,
    purchase_invoice_external_id,
    suggested_supplier_id,
    decision,
    reason,
    priority_score,
    outstanding_amount,
    actor_user_id,
    actor_name
  )
  values(
    p_organization_id,
    p_purchase_invoice_external_id,
    p_suggested_supplier_id,
    p_decision,
    nullif(trim(coalesce(p_reason,'')),''),
    p_priority_score,
    p_outstanding_amount,
    p_actor_user_id,
    nullif(trim(coalesce(p_actor_name,'')),'')
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.motil_record_laudus_finance_review_feedback(
  uuid,text,uuid,text,text,numeric,numeric,uuid,text
) from public, anon, authenticated;

grant execute on function public.motil_record_laudus_finance_review_feedback(
  uuid,text,uuid,text,text,numeric,numeric,uuid,text
) to service_role;

comment on function public.motil_record_laudus_finance_review_feedback(
  uuid,text,uuid,text,text,numeric,numeric,uuid,text
) is
  'Records a human finance-review label only. Does not mutate MOTIL payables, payments, purchase orders or suppliers.';
