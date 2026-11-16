create table if not exists public.bodega_meeting_actions_v1 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  action_key text not null check (action_key in ('reports','information_flow','worker_tasks','critical_stock','central_stock')),
  title text not null,
  owner text not null,
  status text not null default 'pending' check (status in ('pending','in_progress','ready_for_validation','completed','blocked')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  evidence_reference text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, action_key)
);

create index if not exists bodega_meeting_actions_v1_org_status_idx
  on public.bodega_meeting_actions_v1 (organization_id, status, updated_at desc);

alter table public.bodega_meeting_actions_v1 enable row level security;
revoke all on public.bodega_meeting_actions_v1 from public, anon, authenticated;
grant select, insert, update on public.bodega_meeting_actions_v1 to service_role;

comment on table public.bodega_meeting_actions_v1 is
  'Acciones ejecutables y evidencia de seguimiento de la reunión de Bodega del 2026-11-16. Los mínimos se registran como propuesta y no alteran stock canónico.';
