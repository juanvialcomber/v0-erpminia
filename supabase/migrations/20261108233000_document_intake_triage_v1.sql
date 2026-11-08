-- MOTIL document intake triage v1.
-- Adds a bounded, auditable processing layer without executing or semantically promoting source files.

create table if not exists public.document_intake_processing_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_item_id uuid not null references public.document_intake_items(id) on delete cascade,
  triage_policy text not null
    check (triage_policy in (
      'safe_classify',
      'non_source_artifact',
      'quarantine_executable',
      'media_metadata_only',
      'archive_review',
      'unsupported_review'
    )),
  processing_state text not null
    check (processing_state in (
      'ready_for_extraction',
      'rejected_non_source',
      'quarantined',
      'metadata_only',
      'review_required',
      'failed'
    )),
  reason_code text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  triaged_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, intake_item_id)
);

create index if not exists document_intake_processing_org_state_idx
  on public.document_intake_processing_state (organization_id, processing_state, updated_at);

alter table public.document_intake_processing_state enable row level security;
revoke all on public.document_intake_processing_state from public, anon, authenticated;
grant select, insert, update on public.document_intake_processing_state to service_role;

create or replace view public.document_intake_triage_queue_v1
with (security_invoker = true)
as
select
  i.id,
  i.organization_id,
  i.original_name,
  i.mime_type,
  i.file_size_bytes,
  i.sha256,
  i.source,
  i.area,
  i.source_path,
  i.status,
  i.metadata,
  i.created_at,
  coalesce(p.attempt_count, 0) as attempt_count,
  p.processing_state as previous_processing_state
from public.document_intake_items i
left join public.document_intake_processing_state p
  on p.organization_id=i.organization_id
 and p.intake_item_id=i.id
where i.status='pending_classification'
  and (p.id is null or p.processing_state='failed');

revoke all on public.document_intake_triage_queue_v1 from public, anon, authenticated;
grant select on public.document_intake_triage_queue_v1 to service_role;

create or replace view public.document_intake_triage_service_v1
with (security_invoker = true)
as
select
  organization_id,
  triage_policy,
  processing_state,
  count(*)::bigint as item_count,
  max(updated_at) as last_updated_at
from public.document_intake_processing_state
group by organization_id, triage_policy, processing_state;

revoke all on public.document_intake_triage_service_v1 from public, anon, authenticated;
grant select on public.document_intake_triage_service_v1 to service_role;
