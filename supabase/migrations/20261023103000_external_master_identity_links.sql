-- External master identity bridge for future ERP migrations.
-- Keeps external identities separate from canonical MOTIL business entities.

create table if not exists integration.external_entity_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references integration.external_sources(id) on delete restrict,
  entity_type text not null
    check (entity_type in ('product','supplier','warehouse','cost_center','asset')),
  external_id text not null,
  external_code text,
  canonical_schema text not null,
  canonical_table text not null,
  canonical_id text not null,
  link_status text not null default 'matched'
    check (link_status in ('matched','confirmed','conflict','superseded')),
  match_method text not null
    check (match_method in ('exact_id','exact_code','exact_tax_id','deterministic_rule','human_review')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source_updated_at timestamptz,
  linked_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, entity_type, external_id)
);

create index if not exists integration_external_entity_links_canonical_idx
  on integration.external_entity_links(
    organization_id,
    source_id,
    entity_type,
    canonical_schema,
    canonical_table,
    canonical_id
  );

create unique index if not exists integration_external_entity_links_active_canonical_uq
  on integration.external_entity_links(
    source_id,
    entity_type,
    canonical_schema,
    canonical_table,
    canonical_id
  )
  where link_status in ('matched','confirmed');

revoke all on integration.external_entity_links from public, anon, authenticated;
grant select, insert, update, delete on integration.external_entity_links to service_role;

comment on table integration.external_entity_links is
  'Persistent external-to-canonical identity links. Does not make external data canonical and does not authorize writes back to the source.';

comment on column integration.external_entity_links.external_id is
  'Stable external system identifier such as Laudus entity id.';

comment on column integration.external_entity_links.external_code is
  'Human/business code from the external source when present; never used alone to overwrite canonical identity.';

comment on column integration.external_entity_links.match_method is
  'How the link was established. human_review is required when deterministic identity is insufficient.';
