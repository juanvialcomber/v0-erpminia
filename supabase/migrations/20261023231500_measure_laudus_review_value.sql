alter table public.laudus_match_review_decisions
  add column if not exists reason_code text,
  add column if not exists review_started_at timestamptz,
  add column if not exists review_duration_ms integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='laudus_match_review_reason_code_check'
  ) then
    alter table public.laudus_match_review_decisions
      add constraint laudus_match_review_reason_code_check
      check (
        reason_code is null or reason_code in (
          'approved_match','wrong_order','quantity_mismatch','price_mismatch',
          'warehouse_mismatch','date_mismatch','insufficient_evidence','other'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname='laudus_match_review_duration_check'
  ) then
    alter table public.laudus_match_review_decisions
      add constraint laudus_match_review_duration_check
      check (review_duration_ms is null or review_duration_ms between 0 and 86400000);
  end if;
end $$;

create table if not exists public.laudus_match_review_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_external_id text not null,
  order_external_id text not null,
  event_type text not null check (event_type in ('shown')),
  actor_id uuid not null,
  candidate_status text,
  score integer,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (organization_id, actor_id, invoice_external_id, order_external_id, event_type)
);

create index if not exists idx_laudus_match_review_events_lookup
  on public.laudus_match_review_events (
    organization_id, actor_id, invoice_external_id, order_external_id, occurred_at desc
  );

alter table public.laudus_match_review_events enable row level security;
revoke all on table public.laudus_match_review_events from public, anon, authenticated, service_role;
grant select, insert on table public.laudus_match_review_events to service_role;

comment on table public.laudus_match_review_events is
  'Non-canonical review telemetry for measuring human reconciliation effort. Backend-only, append-only, and never financial authority.';
