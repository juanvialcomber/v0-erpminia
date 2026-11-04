begin;

create table if not exists public.maintenance_preventive_history_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  archive_id uuid not null,
  canonical_asset_id uuid not null,
  decision text not null check (decision in ('validated','dismissed')),
  reviewed_task_name text null,
  reviewed_frequency_hours numeric null,
  reviewed_frequency_days integer null,
  review_note text null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, archive_id)
);

create index if not exists maintenance_preventive_history_reviews_asset_idx
  on public.maintenance_preventive_history_reviews(organization_id, canonical_asset_id, reviewed_at desc);

alter table public.maintenance_preventive_history_reviews enable row level security;

drop policy if exists maintenance_preventive_history_reviews_org_isolation on public.maintenance_preventive_history_reviews;
create policy maintenance_preventive_history_reviews_org_isolation
on public.maintenance_preventive_history_reviews
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

comment on table public.maintenance_preventive_history_reviews is
  'Human decisions over historical preventive schedule candidates. Historical source remains immutable.';

commit;