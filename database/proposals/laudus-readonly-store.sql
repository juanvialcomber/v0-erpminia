-- REVIEW PROPOSAL ONLY. Not deployed; not an automatic migration.
-- Private schema outside the PostgREST exposed schemas; no browser role access.
begin;
create schema motil_laudus;
revoke all on schema motil_laudus from public,anon,authenticated;
create table motil_laudus.monthly_usage (
 company_vat text not null, month text not null,
 organization_id uuid not null references public.organizations(id),
 baseline_calls integer not null check(baseline_calls>=0),
 reserved integer not null default 0 check(reserved>=0),
 baseline_valid_until timestamptz not null,
 primary key(company_vat,month)
);
-- baseline_calls + reserved is conservative. Never reset reservations without
-- reconciling the provider count under the same company advisory lock.
create table motil_laudus.sessions (
 organization_id uuid not null references public.organizations(id), company_vat text not null,
 ciphertext text not null, primary key(organization_id,company_vat)
);
create table motil_laudus.sync_state (
 organization_id uuid not null references public.organizations(id), company_vat text not null,
 domain text not null, checkpoint jsonb not null,
 primary key(organization_id,company_vat,domain)
);
create table motil_laudus.evidence (
 organization_id uuid not null references public.organizations(id), company_vat text not null,
 domain text not null, external_id text not null, module text not null,
 payload jsonb not null, observed_at timestamptz not null default now(),
 primary key(organization_id,company_vat,domain,external_id)
);
create table motil_laudus.call_results (
 id bigint generated always as identity primary key,
 organization_id uuid not null references public.organizations(id),company_vat text not null,
 path text not null,status integer not null, recorded_at timestamptz not null default now()
);
create index on motil_laudus.call_results(company_vat,recorded_at);
alter table motil_laudus.monthly_usage enable row level security;
alter table motil_laudus.sessions enable row level security;
alter table motil_laudus.sync_state enable row level security;
alter table motil_laudus.evidence enable row level security;
alter table motil_laudus.call_results enable row level security;
revoke all on all tables in schema motil_laudus from public,anon,authenticated;
-- Only the server's privileged connection/owner may operate. Do not grant
-- schema access to authenticated; module reads require existing server RBAC.
commit;
