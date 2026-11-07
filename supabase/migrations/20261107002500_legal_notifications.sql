create table if not exists public.legal_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  type text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists legal_notifications_user_created_idx
  on public.legal_notifications (organization_id, user_id, created_at desc);

alter table public.legal_notifications enable row level security;

comment on table public.legal_notifications is
  'Server-managed Legal notifications. No client policies; access only through authorized MOTIL server routes.';