-- Human feedback for Laudus finance review.
-- Learning evidence only. Never mutates canonical payables, suppliers, purchase orders or Laudus.

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

revoke all on integration.laudus_finance_review_feedback
  from public, anon, authenticated;

grant select, insert on integration.laudus_finance_review_feedback
  to service_role;

comment on table integration.laudus_finance_review_feedback is
  'Human review labels for Laudus finance intelligence. These labels are learning evidence only and never approve, create or modify canonical financial records.';
