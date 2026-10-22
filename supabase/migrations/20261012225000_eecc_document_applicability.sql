-- EECC normative applicability; additive, no automatic approvals.
create table if not exists public.eecc_document_applicability (
  id uuid primary key default gen_random_uuid(),
  carpeta_id uuid not null references public.carpetas_arranque(id) on delete cascade,
  slot_index integer not null check (slot_index between 1 and 19),
  applicability text not null default 'pendiente' check(applicability in ('pendiente','aplica','no_aplica')),
  rationale text,
  legal_basis text,
  evidence_reference text,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(carpeta_id,slot_index),
  check (applicability='pendiente' or (length(trim(coalesce(rationale,'')))>=8 and decided_by is not null and decided_at is not null)),
  check (applicability <> 'no_aplica' or length(trim(coalesce(legal_basis,'')))>=5)
);
create index if not exists eecc_document_applicability_folder_idx on public.eecc_document_applicability(carpeta_id,applicability);
alter table public.eecc_document_applicability enable row level security;
-- No direct client policies: service-side route enforces scoped Legal EECC editing.
comment on table public.eecc_document_applicability is 'Human-reviewed applicability of EECC document slots; not an operational work/access permit.';

-- Explicit Data API contract; no new client access. RLS is unchanged.
-- Consumer: app/api/carpeta-arranque/[id]/applicability/route.ts
grant select, insert, update on table public.eecc_document_applicability to service_role;
