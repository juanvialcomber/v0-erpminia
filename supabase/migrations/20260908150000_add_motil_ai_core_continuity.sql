-- MOTIL Intelligence Core conversational continuity.
-- This layer stores non-canonical working context only. Canonical operational
-- truth remains in the domain sources queried by each specialist.

create table if not exists public.motil_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  domain text not null check (domain = any (array[
    'executive'::text,
    'inventory'::text,
    'procurement'::text,
    'production'::text,
    'finance'::text,
    'documents'::text,
    'data_health'::text
  ])),
  title text,
  status text not null default 'active' check (status = any (array['active'::text, 'archived'::text])),
  last_message_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists motil_ai_conversations_scope_idx
  on public.motil_ai_conversations (organization_id, user_id, domain, status, last_message_at desc);

create table if not exists public.motil_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.motil_ai_conversations(id) on delete cascade,
  organization_id uuid not null,
  user_id uuid not null,
  domain text not null check (domain = any (array[
    'executive'::text,
    'inventory'::text,
    'procurement'::text,
    'production'::text,
    'finance'::text,
    'documents'::text,
    'data_health'::text
  ])),
  role text not null check (role = any (array['user'::text, 'assistant'::text])),
  content text not null,
  source_refs jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists motil_ai_messages_conversation_idx
  on public.motil_ai_messages (conversation_id, created_at);

create index if not exists motil_ai_messages_scope_idx
  on public.motil_ai_messages (organization_id, user_id, domain, created_at desc);

create table if not exists public.motil_ai_user_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  domain text not null check (domain = any (array[
    'executive'::text,
    'inventory'::text,
    'procurement'::text,
    'production'::text,
    'finance'::text,
    'documents'::text,
    'data_health'::text
  ])),
  memory_type text not null check (memory_type = any (array[
    'preference'::text,
    'responsibility'::text,
    'terminology'::text,
    'working_context'::text,
    'decision_rule'::text,
    'observation'::text
  ])),
  memory_text text not null,
  confidence numeric(4,3) not null default 0.700 check (confidence >= 0 and confidence <= 1),
  source_message_id uuid references public.motil_ai_messages(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists motil_ai_user_memory_lookup_idx
  on public.motil_ai_user_memory (organization_id, user_id, domain, active, updated_at desc);

alter table public.motil_ai_conversations enable row level security;
alter table public.motil_ai_messages enable row level security;
alter table public.motil_ai_user_memory enable row level security;

comment on table public.motil_ai_conversations is
  'Non-canonical conversational continuity for MOTIL Intelligence Core. Never an operational source of truth.';
comment on table public.motil_ai_messages is
  'Non-canonical user/assistant transcript scoped by organization, user and specialist domain.';
comment on table public.motil_ai_user_memory is
  'Optional durable working memory for MOTIL Intelligence Core. Never canonical operational evidence.';

-- Explicit Data API contract; no new client access. RLS is unchanged.
-- Consumer: lib/intelligence/core-conversation.ts
grant select, insert, update on table public.motil_ai_conversations to service_role;
-- Consumer: lib/intelligence/core-conversation.ts
grant select, insert on table public.motil_ai_messages to service_role;
-- Consumer: lib/intelligence/core-conversation.ts; app/api/intelligence/memory/route.ts
grant select, insert, update on table public.motil_ai_user_memory to service_role;
