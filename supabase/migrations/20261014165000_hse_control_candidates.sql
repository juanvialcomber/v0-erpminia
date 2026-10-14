-- Evidence-backed provisional HSE controls. Applied separately in Supabase.
create table if not exists canonical.hse_control_candidates (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 source_document_id uuid not null,
 source_fragment_id uuid not null references canonical.hse_document_fragments(id),
 rule_code text not null,
 domain text not null,
 obligation text not null,
 responsible_role text,
 evidence_excerpt text not null,
 validation_status text not null default 'pending' check(validation_status in ('pending','verified','rejected')),
 created_at timestamptz not null default now(),
 unique(source_fragment_id,rule_code)
);
create index if not exists hse_control_candidates_org_domain_idx on canonical.hse_control_candidates(organization_id,domain);
alter table canonical.hse_control_candidates enable row level security;
revoke all on canonical.hse_control_candidates from anon,authenticated;
grant select,insert on canonical.hse_control_candidates to service_role;
