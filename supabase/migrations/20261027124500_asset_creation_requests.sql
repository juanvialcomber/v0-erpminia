-- Controlled creation queue for accepted Asset 360 candidates.
-- Canonical assets are not created here. This table owns the preparation state only.

create table if not exists public.asset_creation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reconciliation_review_id uuid not null references public.data_reconciliation_reviews(id) on delete restrict,
  candidate_key text not null,
  state text not null default 'awaiting_code'
    check (state in ('awaiting_code','ready_to_create','created','conflict','cancelled')),
  proposed_asset_code text,
  canonical_asset_id uuid references canonical.assets(id) on delete restrict,
  source_snapshot jsonb not null default '{}'::jsonb,
  requested_by uuid,
  code_assigned_by uuid,
  code_assigned_at timestamptz,
  created_by uuid,
  canonical_created_at timestamptz,
  conflict_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,reconciliation_review_id)
);

create unique index if not exists asset_creation_requests_org_code_active_uidx
  on public.asset_creation_requests(organization_id,proposed_asset_code)
  where proposed_asset_code is not null and state <> 'cancelled';

create index if not exists asset_creation_requests_org_state_idx
  on public.asset_creation_requests(organization_id,state,created_at);

alter table public.asset_creation_requests enable row level security;
revoke all on table public.asset_creation_requests from public,anon,authenticated;
grant select,insert,update,delete on table public.asset_creation_requests to service_role;

create or replace function public.motil_prepare_asset_creation_requests(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_inserted integer := 0;
  v_total integer := 0;
begin
  insert into public.asset_creation_requests(
    organization_id,
    reconciliation_review_id,
    candidate_key,
    state,
    source_snapshot,
    requested_by
  )
  select
    r.organization_id,
    r.id,
    regexp_replace(r.issue_key,'^asset_missing_candidate:','',''),
    'awaiting_code',
    jsonb_build_object(
      'issue_key',r.issue_key,
      'issue_type',r.issue_type,
      'evidence_reference',r.evidence_reference,
      'resolution_note',r.resolution_note,
      'reviewed_at',r.reviewed_at
    ),
    r.reviewed_by
  from public.data_reconciliation_reviews r
  where r.organization_id=p_organization_id
    and r.entity_type='asset'
    and r.issue_type='missing_canonical_asset_candidate'
    and r.status='accepted'
  on conflict (organization_id,reconciliation_review_id) do nothing;

  get diagnostics v_inserted = row_count;

  select count(*) into v_total
  from public.asset_creation_requests q
  where q.organization_id=p_organization_id
    and q.state in ('awaiting_code','ready_to_create');

  return jsonb_build_object(
    'inserted',v_inserted,
    'open_requests',v_total,
    'canonical_mutated',false
  );
end;
$function$;

revoke all on function public.motil_prepare_asset_creation_requests(uuid)
  from public,anon,authenticated;
grant execute on function public.motil_prepare_asset_creation_requests(uuid)
  to service_role;

comment on table public.asset_creation_requests is
'Preparation queue for human-approved Asset 360 creation. It is not canonical asset truth and cannot create assets by itself.';
