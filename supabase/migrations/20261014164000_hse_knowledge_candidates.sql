-- Source document classification candidates. Existing database table was applied earlier.
create table if not exists canonical.hse_knowledge_candidates (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 source_document_id uuid not null,
 source_sha256 text not null,
 document_type text not null,
 subject_area text not null,
 entity_scope text not null,
 title_candidate text not null,
 evidence_fragment_ids uuid[] not null,
 validation_status text not null default 'pending' check(validation_status in ('pending','verified','rejected')),
 created_at timestamptz not null default now(),
 unique(source_document_id,source_sha256)
);
create index if not exists hse_knowledge_candidates_org_idx on canonical.hse_knowledge_candidates(organization_id,document_type);
alter table canonical.hse_knowledge_candidates enable row level security;
revoke all on canonical.hse_knowledge_candidates from anon,authenticated;
grant select,insert on canonical.hse_knowledge_candidates to service_role;
