-- MOTIL official messaging: tenant-scoped links to canonical asset 360.
-- Additive only; no alteration of asset master, OT lifecycle or chat messages.
create table if not exists public.motil_message_asset_contexts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null,
  asset_id uuid not null references canonical.assets(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint motil_message_asset_context_thread_fk
    foreign key (thread_id, organization_id)
    references public.motil_message_threads(id, organization_id) on delete cascade,
  constraint motil_message_asset_context_unique
    unique (organization_id, thread_id, asset_id)
);
create index if not exists motil_message_asset_context_asset_idx
  on public.motil_message_asset_contexts (organization_id, asset_id, created_at desc);
create index if not exists motil_message_asset_context_thread_idx
  on public.motil_message_asset_contexts (organization_id, thread_id, created_at desc);

-- Verify foreign-tenant references and canonical direct membership independently
-- from the API, including when a server-side privileged DB client is used.
create or replace function public.motil_message_validate_asset_context()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from canonical.assets a
    where a.id = new.asset_id and a.organization_id = new.organization_id
  ) then
    raise exception 'Asset not available in this organization' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.motil_message_threads t
    where t.id = new.thread_id and t.organization_id = new.organization_id
      and t.kind = 'direct'
      and new.created_by in (t.participant_a, t.participant_b)
  ) then
    raise exception 'Only a direct-thread participant may link an asset' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = new.created_by and p.organization_id = new.organization_id
      and p.status = 'active'
  ) then
    raise exception 'Inactive or cross-organization actor' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists motil_message_validate_asset_context_insert
  on public.motil_message_asset_contexts;
create trigger motil_message_validate_asset_context_insert
before insert on public.motil_message_asset_contexts
for each row execute function public.motil_message_validate_asset_context();

alter table public.motil_message_asset_contexts enable row level security;
revoke all on public.motil_message_asset_contexts from public, anon, authenticated;
grant select, insert on public.motil_message_asset_contexts to service_role;
revoke all on function public.motil_message_validate_asset_context() from public, anon, authenticated;
grant execute on function public.motil_message_validate_asset_context() to service_role;
