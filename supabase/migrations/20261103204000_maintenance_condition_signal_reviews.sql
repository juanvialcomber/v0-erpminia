begin;

create table if not exists public.maintenance_condition_signal_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  signal_key text not null,
  canonical_asset_id uuid not null,
  signal_type text not null,
  decision text not null,
  decision_note text null,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  reviewed_by uuid null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, signal_key),
  constraint maintenance_condition_signal_review_decision_check
    check (decision in ('confirmed','dismissed','monitor'))
);

create index if not exists maintenance_condition_signal_reviews_asset_idx
  on public.maintenance_condition_signal_reviews(organization_id, canonical_asset_id, reviewed_at desc);

alter table public.maintenance_condition_signal_reviews enable row level security;
drop policy if exists maintenance_condition_signal_reviews_org_isolation on public.maintenance_condition_signal_reviews;
create policy maintenance_condition_signal_reviews_org_isolation
on public.maintenance_condition_signal_reviews
for all
to authenticated
using (
  organization_id in (
    select ur.organization_id
    from public.user_roles ur
    where ur.user_id = (select public.current_application_user_id())
  )
)
with check (
  organization_id in (
    select ur.organization_id
    from public.user_roles ur
    where ur.user_id = (select public.current_application_user_id())
  )
);

comment on table public.maintenance_condition_signal_reviews is
  'Human review of derived maintenance condition signals. A review never mutates canonical asset or work-order state.';

commit;