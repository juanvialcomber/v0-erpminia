-- Laudus -> MOTIL integration intake layer.
-- Private staging only. No canonical or operational mutation is performed here.

create schema if not exists integration;

create table if not exists integration.external_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_key text not null,
  display_name text not null,
  mode text not null default 'read_only' check (mode in ('read_only','read_write')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_key)
);

create table if not exists integration.sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete restrict,
  run_kind text not null check (run_kind in ('discovery','bootstrap','delta','reconcile','smoke_test')),
  status text not null check (status in ('queued','running','completed','partial','failed','cancelled')),
  started_at timestamptz,
  finished_at timestamptz,
  checkpoint jsonb not null default '{}'::jsonb,
  counters jsonb not null default '{}'::jsonb,
  error_summary text,
  created_at timestamptz not null default now()
);

create table if not exists integration.raw_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete restrict,
  sync_run_id uuid references integration.sync_runs(id) on delete set null,
  entity_type text not null,
  external_id text not null,
  source_updated_at timestamptz,
  observed_at timestamptz not null default now(),
  payload_hash text not null,
  payload jsonb not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  unique (source_id, entity_type, external_id, payload_hash)
);

create unique index if not exists integration_raw_records_one_current_idx
  on integration.raw_records(source_id, entity_type, external_id)
  where is_current;

create index if not exists integration_raw_records_entity_time_idx
  on integration.raw_records(organization_id, source_id, entity_type, observed_at desc);

create table if not exists integration.reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete restrict,
  raw_record_id uuid not null references integration.raw_records(id) on delete restrict,
  entity_type text not null,
  external_id text not null,
  canonical_schema text,
  canonical_table text,
  canonical_id text,
  resolution_status text not null default 'pending'
    check (resolution_status in ('pending','matched','new_candidate','conflict','ignored','superseded')),
  resolution_method text
    check (resolution_method is null or resolution_method in ('exact_id','exact_code','exact_tax_id','deterministic_rule','human_review')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  conflict_reasons text[] not null default '{}',
  proposed_patch jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, entity_type, external_id, raw_record_id)
);

create index if not exists integration_reconciliation_queue_idx
  on integration.reconciliation_items(organization_id, source_id, resolution_status, entity_type, created_at);

create table if not exists integration.entity_checkpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete restrict,
  entity_type text not null,
  cursor jsonb not null default '{}'::jsonb,
  last_successful_sync_at timestamptz,
  last_source_updated_at timestamptz,
  last_payload_hash text,
  updated_at timestamptz not null default now(),
  unique (source_id, entity_type)
);

revoke all on schema integration from public, anon, authenticated;
revoke all on all tables in schema integration from public, anon, authenticated;
grant usage on schema integration to service_role;
grant select, insert, update, delete on all tables in schema integration to service_role;

comment on schema integration is 'Private external-system intake and reconciliation layer. Never canonical business truth.';
comment on table integration.raw_records is 'Immutable source evidence versions from external systems such as Laudus.';
comment on table integration.reconciliation_items is 'Reviewable bridge between external evidence and MOTIL canonical entities; never an automatic approval.';
