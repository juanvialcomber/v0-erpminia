-- Per-user PWA push subscriptions. Endpoints and encryption keys are server-only.
create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_test_at timestamptz,
  constraint user_push_endpoint_https check (endpoint ~ '^https://')
);
create index if not exists user_push_subscriptions_user_idx on public.user_push_subscriptions (organization_id,user_id) where enabled;
alter table public.user_push_subscriptions enable row level security;
revoke all on public.user_push_subscriptions from anon, authenticated;
comment on table public.user_push_subscriptions is 'Private Web Push endpoints and encryption material; only accessed by trusted MOTIL server via organization-scoped session.';
