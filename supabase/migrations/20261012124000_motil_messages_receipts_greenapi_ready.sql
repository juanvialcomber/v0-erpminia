-- MOTIL official communications: receipt audit and optional transport boundary.
-- Additive schema. No WhatsApp credentials or messages are inserted by this migration.

create table if not exists public.motil_message_read_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null,
  message_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  read_at timestamptz not null default now(),
  foreign key (thread_id, organization_id)
    references public.motil_message_threads(id, organization_id) on delete cascade,
  foreign key (message_id, organization_id)
    references public.motil_message_entries(id, organization_id) on delete cascade,
  unique (thread_id, profile_id, message_id)
);
create index if not exists motil_message_read_events_actor_idx
  on public.motil_message_read_events(organization_id, profile_id, read_at desc);

create table if not exists public.motil_message_transport_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid not null,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  channel text not null check (channel in ('web_push', 'whatsapp')),
  provider text not null check (provider in ('web_push', 'greenapi')),
  delivery_state text not null check (delivery_state in ('accepted','retry','skipped','failed')),
  attempt integer not null check (attempt >= 0),
  accepted_devices integer not null default 0 check (accepted_devices >= 0),
  error_code text,
  occurred_at timestamptz not null default now(),
  foreign key (message_id, organization_id)
    references public.motil_message_entries(id, organization_id) on delete cascade
);
create index if not exists motil_message_transport_events_log_idx
  on public.motil_message_transport_events(organization_id, message_id, occurred_at desc);

-- Provider configuration contains NO tokens. Credentials will be held in
-- encrypted environment variables when the second-layer bridge is activated.
create table if not exists public.motil_message_provider_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('greenapi')),
  enabled boolean not null default false,
  outbound_alerts_enabled boolean not null default false,
  inbound_ingest_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (organization_id, provider),
  constraint motil_greenapi_disabled_guard check (
    enabled or (not outbound_alerts_enabled and not inbound_ingest_enabled)
  )
);

-- Deduplicated, quarantined envelope for a future authenticated Green API
-- webhook. No webhook is enabled and no raw sensitive payload is stored now.
create table if not exists public.motil_message_external_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('greenapi')),
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 255),
  event_type text not null check (event_type in ('incoming', 'delivery_status', 'other')),
  processing_status text not null default 'quarantined'
    check (processing_status in ('quarantined', 'verified', 'processed', 'failed')),
  linked_message_id uuid,
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  foreign key (linked_message_id, organization_id)
    references public.motil_message_entries(id, organization_id) on delete restrict,
  unique (organization_id, provider, provider_event_id, event_type)
);
create index if not exists motil_message_external_events_queue_idx
  on public.motil_message_external_events(organization_id, processing_status, received_at);

alter table public.motil_message_read_events enable row level security;
alter table public.motil_message_transport_events enable row level security;
alter table public.motil_message_provider_settings enable row level security;
alter table public.motil_message_external_events enable row level security;

revoke all on public.motil_message_read_events,
  public.motil_message_transport_events,
  public.motil_message_provider_settings,
  public.motil_message_external_events
  from public, anon, authenticated;
grant all on public.motil_message_read_events,
  public.motil_message_transport_events,
  public.motil_message_provider_settings,
  public.motil_message_external_events to service_role;
grant usage, select on sequence public.motil_message_read_events_id_seq,
  public.motil_message_transport_events_id_seq,
  public.motil_message_external_events_id_seq to service_role;

-- A monotonic read acknowledgement updates the cursor and appends an audit
-- event in the same transaction, but ONLY when that cursor advances.
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
  advanced_id uuid;
begin
  if not exists (
    select 1 from public.profiles p
    join public.motil_message_threads t on t.id = p_thread_id
      and t.organization_id = p_organization_id
    where p.id = p_profile_id and p.organization_id = p_organization_id
      and p.status = 'active'
      and (t.kind = 'general' or t.participant_a = p_profile_id or t.participant_b = p_profile_id)
  ) then
    raise exception 'Reader is not a member of this conversation';
  end if;

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
        updated_at = now()
    where public.motil_message_reads.last_read_at < excluded.last_read_at
  returning profile_id into advanced_id;

  if advanced_id is not null then
    insert into public.motil_message_read_events
      (organization_id, thread_id, message_id, profile_id)
    values (p_organization_id, p_thread_id, p_message_id, p_profile_id)
    on conflict (thread_id, profile_id, message_id) do nothing;
  end if;
end $$;
revoke all on function public.motil_message_advance_read(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.motil_message_advance_read(uuid,uuid,uuid,uuid)
  to service_role;

-- Record notification results together with the durable outbox transition.
create or replace function public.motil_message_finish_push(
  p_job_id bigint,
  p_organization_id uuid,
  p_attempt integer,
  p_state text,
  p_accepted_devices integer,
  p_error_code text,
  p_retry_at timestamptz
) returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  updated_job record;
begin
  if p_state not in ('accepted', 'retry', 'skipped', 'failed') then
    raise exception 'Unknown message delivery state';
  end if;
  update public.motil_message_push_outbox q
  set status = p_state,
      accepted_devices = greatest(p_accepted_devices, 0),
      next_attempt_at = case when p_state = 'retry' then p_retry_at else now() end,
      lease_until = null,
      last_error = left(p_error_code, 128),
      updated_at = now()
  where q.id = p_job_id and q.organization_id = p_organization_id
    and q.status = 'sending' and q.attempts = p_attempt
  returning q.message_id, q.recipient_id into updated_job;

  if not found then return false; end if;

  insert into public.motil_message_transport_events
    (organization_id, message_id, recipient_id, channel, provider, delivery_state,
     attempt, accepted_devices, error_code)
  values (p_organization_id, updated_job.message_id, updated_job.recipient_id,
    'web_push', 'web_push', p_state, p_attempt, greatest(p_accepted_devices, 0),
    left(p_error_code, 128));
  return true;
end $$;
revoke all on function public.motil_message_finish_push(bigint,uuid,integer,text,integer,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.motil_message_finish_push(bigint,uuid,integer,text,integer,text,timestamptz)
  to service_role;

-- Settings are OFF until a separate opt-in and verified Green API webhook.
insert into public.motil_message_provider_settings (organization_id,provider,enabled)
select id,'greenapi',false from public.organizations
on conflict (organization_id,provider) do nothing;
