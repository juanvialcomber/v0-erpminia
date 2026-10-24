create table if not exists public.geology_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  title text,
  status text not null default 'active' check (status in ('active','archived')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists geology_ai_conversations_user_idx
  on public.geology_ai_conversations (organization_id, user_id, last_message_at desc);

create table if not exists public.geology_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.geology_ai_conversations(id) on delete cascade,
  organization_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  source_refs jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists geology_ai_messages_conversation_idx
  on public.geology_ai_messages (conversation_id, created_at asc);
create index if not exists geology_ai_messages_user_idx
  on public.geology_ai_messages (organization_id, user_id, created_at desc);

create table if not exists public.geology_ai_user_memory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  memory_type text not null check (memory_type in ('preference','responsibility','terminology','working_context','decision_rule','observation')),
  memory_text text not null,
  confidence numeric(4,3) not null default 0.700 check (confidence >= 0 and confidence <= 1),
  source_message_id uuid references public.geology_ai_messages(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists geology_ai_user_memory_lookup_idx
  on public.geology_ai_user_memory (organization_id, user_id, active, updated_at desc);

alter table public.geology_ai_conversations enable row level security;
alter table public.geology_ai_messages enable row level security;
alter table public.geology_ai_user_memory enable row level security;

comment on table public.geology_ai_conversations is 'Server-managed conversational sessions for the La Patagua geology AI agent.';
comment on table public.geology_ai_messages is 'Tenant-scoped conversation history. Canonical source references are stored separately from generated prose.';
comment on table public.geology_ai_user_memory is 'Durable user-specific working context learned only from user-authored conversation turns.';

-- Explicit Data API contract; no new client access. RLS is unchanged.
-- Consumer: app/api/produccion/geologia/assistant/route.ts
grant select, insert, update on table public.geology_ai_conversations to service_role;
-- Consumer: app/api/produccion/geologia/assistant/route.ts
grant select, insert on table public.geology_ai_messages to service_role;
-- Consumer: app/api/intelligence/memory/route.ts
grant select, insert, update on table public.geology_ai_user_memory to service_role;
