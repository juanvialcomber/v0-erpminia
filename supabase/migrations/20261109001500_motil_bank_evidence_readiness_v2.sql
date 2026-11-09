-- MOTIL bank evidence readiness v2
-- Accepts current bank-statement evidence uploaded directly to MOTIL as a valid
-- source for reconciliation readiness. This does NOT reconcile payments, mutate
-- Laudus, or promote any accounting state automatically.

create or replace view public.laudus_bank_reconciliation_readiness_v1
with (security_invoker = true)
as
with payments as (
  select
    organization_id,
    count(*) as payment_count,
    count(*) filter (where deposited = true) as deposited_count,
    min(issued_date) as min_payment_date,
    max(issued_date) as max_payment_date,
    max(synced_at) as latest_payment_sync
  from integration.laudus_purchase_payments
  group by organization_id
),
laudus_statements as (
  select
    organization_id,
    count(*) as statement_count,
    min(date_from) as min_statement_from,
    max(date_to) as max_statement_to,
    max(synced_at) as latest_statement_sync
  from integration.laudus_bank_statements
  group by organization_id
),
motil_documents as (
  select
    organization_id,
    count(*) as document_count,
    count(*) filter (where valid_until is not null) as dated_document_count,
    min(valid_from) filter (where valid_from is not null) as min_document_from,
    max(valid_until) filter (where valid_until is not null) as max_document_to,
    max(uploaded_at) as latest_upload
  from public.module_documents
  where lower(module) = 'finanzas'
    and document_type_category = 'Cartola bancaria'
    and deleted_at is null
    and is_active = true
  group by organization_id
),
evidence as (
  select
    p.organization_id,
    p.payment_count,
    p.deposited_count,
    p.min_payment_date,
    p.max_payment_date,
    p.latest_payment_sync,
    coalesce(l.statement_count, 0) as laudus_statement_count,
    l.min_statement_from as laudus_min_statement_from,
    l.max_statement_to as laudus_max_statement_to,
    l.latest_statement_sync as laudus_latest_statement_sync,
    coalesce(m.document_count, 0) as motil_document_count,
    coalesce(m.dated_document_count, 0) as motil_dated_document_count,
    m.min_document_from as motil_min_document_from,
    m.max_document_to as motil_max_document_to,
    m.latest_upload as motil_latest_upload,
    coalesce(l.statement_count, 0) + coalesce(m.dated_document_count, 0) as statement_count,
    least(l.min_statement_from, m.min_document_from) as min_statement_from,
    greatest(l.max_statement_to, m.max_document_to) as max_statement_to,
    greatest(l.latest_statement_sync, m.latest_upload) as latest_statement_sync
  from payments p
  left join laudus_statements l on l.organization_id = p.organization_id
  left join motil_documents m on m.organization_id = p.organization_id
)
select
  organization_id,
  payment_count,
  deposited_count,
  min_payment_date,
  max_payment_date,
  latest_payment_sync,
  statement_count,
  min_statement_from,
  max_statement_to,
  latest_statement_sync,
  case
    when laudus_statement_count = 0 and motil_document_count = 0
      then 'missing_bank_evidence'
    when motil_document_count > 0
      and motil_dated_document_count = 0
      and (laudus_max_statement_to is null
        or (max_payment_date is not null and laudus_max_statement_to < max_payment_date - interval '30 days'))
      then 'bank_evidence_needs_dates'
    when max_statement_to is null
      then 'missing_bank_evidence'
    when max_payment_date is not null
      and max_statement_to < max_payment_date - interval '30 days'
      then 'stale_bank_evidence'
    else 'evidence_ready'
  end as readiness_state,
  case
    when laudus_statement_count = 0 and motil_document_count = 0 then true
    when motil_document_count > 0
      and motil_dated_document_count = 0
      and (laudus_max_statement_to is null
        or (max_payment_date is not null and laudus_max_statement_to < max_payment_date - interval '30 days'))
      then true
    when max_statement_to is null then true
    when max_payment_date is not null
      and max_statement_to < max_payment_date - interval '30 days'
      then true
    else false
  end as human_action_now,
  laudus_statement_count,
  motil_document_count,
  motil_dated_document_count,
  laudus_max_statement_to,
  motil_max_document_to,
  motil_latest_upload,
  case
    when motil_max_document_to is not null
      and (laudus_max_statement_to is null or motil_max_document_to >= laudus_max_statement_to)
      then 'motil_document'
    when laudus_max_statement_to is not null then 'laudus'
    else 'none'
  end as evidence_source,
  true as reconciliation_still_requires_human_review
from evidence;

revoke all on public.laudus_bank_reconciliation_readiness_v1 from public, anon, authenticated;
grant select on public.laudus_bank_reconciliation_readiness_v1 to service_role;
