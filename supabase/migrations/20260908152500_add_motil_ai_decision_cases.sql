-- Explainable advisory cases for MOTIL Intelligence Core.
-- These records are non-canonical and never authorize operational mutations.

create table if not exists public.motil_ai_decision_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  created_by_user_id uuid not null,
  source_domain text not null check (source_domain = any (array[
    'executive'::text,
    'inventory'::text,
    'procurement'::text,
    'production'::text,
    'finance'::text,
    'documents'::text,
    'data_health'::text
  ])),
  target_domain text not null check (target_domain = any (array[
    'executive'::text,
    'inventory'::text,
    'procurement'::text,
    'production'::text,
    'finance'::text,
    'documents'::text,
    'data_health'::text,
    'maintenance'::text,
    'geology'::text
  ])),
  source_conversation_id uuid references public.motil_ai_conversations(id) on delete set null,
  source_message_id uuid references public.motil_ai_messages(id) on delete set null,
  title text not null,
  summary text not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  uncertainty text,
  contradictions jsonb not null default '[]'::jsonb,
  missing_evidence jsonb not null default '[]'::jsonb,
  recommended_human_action text,
  recommended_workflow_key text,
  authority text not null default 'advisory_only' check (authority = 'advisory_only'),
  status text not null default 'open' check (status = any (array['open'::text, 'acknowledged'::text, 'archived'::text])),
  acknowledged_by_user_id uuid,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists motil_ai_decision_cases_creator_idx
  on public.motil_ai_decision_cases (organization_id, created_by_user_id, status, created_at desc);

create index if not exists motil_ai_decision_cases_handoff_idx
  on public.motil_ai_decision_cases (organization_id, target_domain, status, created_at desc);

create index if not exists motil_ai_decision_cases_source_idx
  on public.motil_ai_decision_cases (source_message_id, source_conversation_id);

alter table public.motil_ai_decision_cases enable row level security;

comment on table public.motil_ai_decision_cases is
  'Non-canonical explainable advisory cases generated from grounded MOTIL assistant messages. Never an approval, work order, purchase decision, alert acknowledgement, or other operational authorization.';
comment on column public.motil_ai_decision_cases.evidence_refs is
  'Server-derived evidence references copied from the grounded assistant message; clients cannot establish provenance by supplying this field.';
comment on column public.motil_ai_decision_cases.recommended_workflow_key is
  'Optional existing human workflow/task key. A reference only; creating a case never executes or mutates that workflow.';

-- Explicit Data API contract; no new client access. RLS is unchanged.
-- Consumer: app/api/intelligence/decision-cases/route.ts
grant select, insert, update on table public.motil_ai_decision_cases to service_role;
