begin;

create table if not exists public.document_intake_entity_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_item_id uuid not null references public.document_intake_items(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  relation_type text not null default 'derived_from'
    check (relation_type in ('derived_from','supports','supersedes')),
  source_sheet text,
  source_row integer,
  source_key text,
  promotion_status text not null default 'promoted'
    check (promotion_status in ('candidate','reviewed','promoted','rejected')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, intake_item_id, entity_type, entity_id, relation_type)
);

create index if not exists document_intake_entity_links_entity_idx
  on public.document_intake_entity_links (organization_id, entity_type, entity_id);

create index if not exists document_intake_entity_links_intake_idx
  on public.document_intake_entity_links (organization_id, intake_item_id);

alter table public.document_intake_entity_links enable row level security;

drop policy if exists document_intake_entity_links_org_read on public.document_intake_entity_links;
create policy document_intake_entity_links_org_read
on public.document_intake_entity_links
for select
to authenticated
using (
  organization_id in (
    select ur.organization_id
    from public.user_roles ur
    where ur.user_id = (select current_application_user_id())
  )
);

grant select on public.document_intake_entity_links to authenticated;
grant select, insert, update, delete on public.document_intake_entity_links to service_role;

comment on table public.document_intake_entity_links is
  'Auditable provenance links from immutable document intake evidence to canonical MOTIL entities.';

commit;
