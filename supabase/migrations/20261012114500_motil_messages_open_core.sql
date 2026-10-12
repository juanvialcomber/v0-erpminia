-- MOTIL Messages: OSS Postgres message archive and durable phone-push queue.
-- All client access goes through authenticated MOTIL APIs; service-role only.
create table if not exists public.motil_message_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_key text not null,
  kind text not null check (kind in ('general', 'direct')),
  title text,
  participant_a uuid references public.profiles(id) on delete restrict,
  participant_b uuid references public.profiles(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, thread_key),
  unique (id, organization_id),
  constraint motil_message_thread_shape check (
    (kind = 'general' and thread_key = 'general' and participant_a is null and participant_b is null)
    or
    (kind = 'direct' and participant_a is not null and participant_b is not null
      and participant_a < participant_b and thread_key = 'dm:' || participant_a::text || ':' || participant_b::text)
  )
);

create table if not exists public.motil_message_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  client_message_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (thread_id, organization_id)
    references public.motil_message_threads(id, organization_id) on delete cascade,
  unique (id, organization_id),
  unique (organization_id, sender_id, client_message_id)
);

create index if not exists motil_message_entries_history_idx
  on public.motil_message_entries(organization_id, thread_id, created_at desc, id desc);
create index if not exists motil_message_threads_tenant_idx
  on public.motil_message_threads(organization_id, kind, created_at desc);

create table if not exists public.motil_message_reads (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default 'epoch'::timestamptz,
  updated_at timestamptz not null default now(),
  primary key (thread_id, profile_id),
  foreign key (thread_id, organization_id)
    references public.motil_message_threads(id, organization_id) on delete cascade
);

create table if not exists public.motil_message_push_outbox (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid not null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'retry', 'accepted', 'skipped', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  accepted_devices integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (message_id, organization_id)
    references public.motil_message_entries(id, organization_id) on delete cascade,
  unique (message_id, recipient_id)
);
create index if not exists motil_message_push_due_idx
  on public.motil_message_push_outbox(next_attempt_at, id)
  where status in ('pending', 'retry', 'sending');

-- A message and its notification request commit in the SAME transaction.
-- General-channel messages remain inbox-only by default to prevent alert fatigue.
create or replace function public.motil_message_enqueue_direct_push()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  t record;
  target_id uuid;
begin
  select kind, participant_a, participant_b into t
  from public.motil_message_threads
  where id = new.thread_id and organization_id = new.organization_id;

  if t.kind = 'direct' then
    target_id := case when new.sender_id = t.participant_a then t.participant_b else t.participant_a end;
    insert into public.motil_message_push_outbox (organization_id, message_id, recipient_id)
    select new.organization_id, new.id, target_id
    where exists (
      select 1 from public.profiles p
      where p.id = target_id and p.organization_id = new.organization_id and p.status = 'active'
    )
    on conflict (message_id, recipient_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists motil_message_enqueue_direct_push on public.motil_message_entries;
create trigger motil_message_enqueue_direct_push
after insert on public.motil_message_entries
for each row execute function public.motil_message_enqueue_direct_push();

-- Claim/retry uses row locks to prevent concurrent cron workers double-sending.
create or replace function public.motil_message_claim_push(batch_size integer default 8)
returns setof public.motil_message_push_outbox
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with claims as (
    select q.id from public.motil_message_push_outbox q
    where q.status in ('pending', 'retry', 'sending')
      and q.next_attempt_at <= now()
      and (q.lease_until is null or q.lease_until < now())
    order by q.next_attempt_at asc, q.id asc
    for update skip locked
    limit least(greatest(batch_size, 1), 12)
  )
  update public.motil_message_push_outbox o
  set status = 'sending', lease_until = now() + interval '2 minutes',
      attempts = o.attempts + 1, updated_at = now()
  from claims
  where o.id = claims.id
  returning o.*;
end $$;

alter table public.motil_message_threads enable row level security;
alter table public.motil_message_entries enable row level security;
alter table public.motil_message_reads enable row level security;
alter table public.motil_message_push_outbox enable row level security;

revoke all on public.motil_message_threads, public.motil_message_entries,
  public.motil_message_reads, public.motil_message_push_outbox
  from public, anon, authenticated;
grant all on public.motil_message_threads, public.motil_message_entries,
  public.motil_message_reads, public.motil_message_push_outbox to service_role;
revoke all on function public.motil_message_claim_push(integer)
  from public, anon, authenticated;
grant execute on function public.motil_message_claim_push(integer) to service_role;
revoke all on function public.motil_message_enqueue_direct_push()
  from public, anon, authenticated;
grant usage, select on sequence public.motil_message_push_outbox_id_seq to service_role;

insert into public.motil_message_threads (organization_id, thread_key, kind, title)
select id, 'general', 'general', 'General'
from public.organizations
on conflict (organization_id, thread_key) do nothing;


-- Keep the General room present for organizations created after this migration.
create or replace function public.motil_message_create_general_room()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.motil_message_threads (organization_id, thread_key, kind, title)
  values (new.id, 'general', 'general', 'General')
  on conflict (organization_id, thread_key) do nothing;
  return new;
end $$;
drop trigger if exists motil_message_create_general_room on public.organizations;
create trigger motil_message_create_general_room
after insert on public.organizations
for each row execute function public.motil_message_create_general_room();
revoke all on function public.motil_message_create_general_room()
  from public, anon, authenticated;

-- Advance the read cursor only to a message that actually exists in this thread,
-- and never move it backwards when mobile requests arrive out of order.
create or replace function public.motil_message_advance_read(
  p_organization_id uuid,
  p_thread_id uuid,
  p_profile_id uuid,
  p_message_id uuid
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  seen_at timestamptz;
begin
  select created_at into seen_at
  from public.motil_message_entries
  where id = p_message_id and organization_id = p_organization_id and thread_id = p_thread_id;
  if seen_at is null then
    raise exception 'Message is not in this thread';
  end if;
  insert into public.motil_message_reads
    (organization_id, thread_id, profile_id, last_read_at, updated_at)
  values (p_organization_id, p_thread_id, p_profile_id, seen_at, now())
  on conflict (thread_id, profile_id) do update
    set last_read_at = greatest(public.motil_message_reads.last_read_at, excluded.last_read_at),
        updated_at = now();
end $$;
revoke all on function public.motil_message_advance_read(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.motil_message_advance_read(uuid,uuid,uuid,uuid)
  to service_role;


-- A single bounded inbox query avoids one HTTP request per conversation.
create or replace function public.motil_message_inbox(
  p_organization_id uuid,
  p_profile_id uuid
) returns table (
  id uuid,
  kind text,
  title text,
  participant_a uuid,
  participant_b uuid,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.kind, t.title, t.participant_a, t.participant_b,
    (select left(m.body, 160) from public.motil_message_entries m
      where m.thread_id = t.id and m.organization_id = p_organization_id
      order by m.created_at desc, m.id desc limit 1) as last_message,
    (select m.created_at from public.motil_message_entries m
      where m.thread_id = t.id and m.organization_id = p_organization_id
      order by m.created_at desc, m.id desc limit 1) as last_message_at,
    (select count(*) from public.motil_message_entries m
      where m.thread_id = t.id and m.organization_id = p_organization_id
        and m.sender_id <> p_profile_id
        and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)) as unread_count
  from public.motil_message_threads t
  left join public.motil_message_reads r
    on r.thread_id = t.id and r.profile_id = p_profile_id
  where t.organization_id = p_organization_id
    and (t.kind = 'general' or t.participant_a = p_profile_id or t.participant_b = p_profile_id)
  order by case when t.kind = 'general' then 0 else 1 end,
    last_message_at desc nulls last, t.created_at desc
  limit 100;
$$;
revoke all on function public.motil_message_inbox(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.motil_message_inbox(uuid,uuid) to service_role;
