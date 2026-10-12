-- MOTIL official messaging: canonical, tenant-scoped contextual links to OT.
-- Additive only. No changes to OT lifecycle, existing messages or read receipts.
create table if not exists public.motil_message_work_order_contexts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null,
  work_order_id uuid not null references public.maintenance_work_orders(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint motil_message_wo_context_thread_fk
    foreign key (thread_id,organization_id)
    references public.motil_message_threads(id,organization_id) on delete cascade,
  constraint motil_message_wo_context_one_per_dm
    unique (organization_id,thread_id,work_order_id)
);
create index if not exists motil_message_wo_context_order_idx
  on public.motil_message_work_order_contexts(organization_id,work_order_id,created_at desc);
create index if not exists motil_message_wo_context_thread_idx
  on public.motil_message_work_order_contexts(organization_id,thread_id,created_at desc);

create or replace function public.motil_message_validate_wo_context()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.maintenance_work_orders w
    where w.id = new.work_order_id and w.organization_id = new.organization_id
  ) then
    raise exception 'OT not available in the organization' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.motil_message_threads t
    where t.id = new.thread_id and t.organization_id = new.organization_id
      and t.kind = 'direct'
      and new.created_by in (t.participant_a,t.participant_b)
  ) then
    raise exception 'Only a direct-thread participant can link an OT' using errcode = '23514';
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

drop trigger if exists motil_message_validate_wo_context_insert
  on public.motil_message_work_order_contexts;
create trigger motil_message_validate_wo_context_insert
before insert on public.motil_message_work_order_contexts
for each row execute function public.motil_message_validate_wo_context();

alter table public.motil_message_work_order_contexts enable row level security;
revoke all on public.motil_message_work_order_contexts from public, anon, authenticated;
grant select, insert on public.motil_message_work_order_contexts to service_role;
revoke all on function public.motil_message_validate_wo_context() from public,anon,authenticated;
grant execute on function public.motil_message_validate_wo_context() to service_role;
