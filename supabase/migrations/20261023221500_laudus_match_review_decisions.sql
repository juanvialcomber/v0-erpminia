create table if not exists public.laudus_match_review_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_external_id text not null,
  order_external_id text not null,
  candidate_status text not null check (candidate_status in ('exact_candidate','probable','ambiguous','review')),
  decision text not null check (decision in ('approved','rejected')),
  reason text not null check (length(trim(reason)) >= 3),
  score integer,
  next_score integer,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  reviewed_by uuid not null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, invoice_external_id, order_external_id)
);

create index if not exists idx_laudus_match_review_decisions_org_time
  on public.laudus_match_review_decisions (organization_id, reviewed_at desc);

create index if not exists idx_laudus_match_review_decisions_org_decision
  on public.laudus_match_review_decisions (organization_id, decision, reviewed_at desc);

alter table public.laudus_match_review_decisions enable row level security;
revoke all on table public.laudus_match_review_decisions from public, anon, authenticated;
grant select, insert on table public.laudus_match_review_decisions to service_role;

comment on table public.laudus_match_review_decisions is
  'Immutable human feedback on Laudus invoice-to-purchase-order candidates. Decisions do not mutate Laudus, canonical procurement documents, approvals or payments.';
