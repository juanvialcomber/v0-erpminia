-- AI suggestions are evidence, never approvals.
create table if not exists public.legal_ai_document_reviews (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 carpeta_id uuid not null references public.carpetas_arranque(id),
 slot_index integer not null,
 file_path text not null,
 file_name text not null,
 file_sha256 text not null,
 model text not null,
 analysis text not null,
 suggestion text,
 suggestion_status text not null default 'proposed' check(suggestion_status in ('proposed','accepted','dismissed')),
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 constraint legal_ai_review_sha check(file_sha256 ~ '^[0-9a-f]{64}$'),
 constraint legal_ai_review_slot check(slot_index > 0),
 constraint legal_ai_review_unique unique(organization_id,carpeta_id,slot_index,file_sha256,created_at)
);
create index if not exists legal_ai_document_reviews_lookup
 on public.legal_ai_document_reviews(organization_id,carpeta_id,slot_index,created_at desc);
alter table public.legal_ai_document_reviews enable row level security;
revoke all on public.legal_ai_document_reviews from anon,authenticated;
comment on table public.legal_ai_document_reviews is 'Immutable AI-origin analysis for manual Legal review. No approval or EECC status changes.';

-- Explicit Data API contract; no new client access. RLS is unchanged.
-- Consumer: app/api/legal/asistente/history/route.ts; app/api/legal/asistente/analyze-document/route.ts
grant select, insert, update on table public.legal_ai_document_reviews to service_role;
