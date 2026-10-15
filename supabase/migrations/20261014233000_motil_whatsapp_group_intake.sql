-- MOTIL WhatsApp group intelligence: isolated external evidence, not internal chat or canonical OT data.
-- Source groups are explicitly allowlisted by an authorized tenant admin. No secrets live in these tables.
create table if not exists public.motil_whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instance_id text not null check (instance_id ~ '^[0-9]{1,20}$'),
  chat_id text not null check (chat_id ~ '^[0-9]{5,30}@g[.]us$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  enabled boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  last_received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (instance_id, chat_id)
);
create index if not exists motil_whatsapp_groups_tenant_idx
  on public.motil_whatsapp_groups(organization_id, enabled, display_name);

create table if not exists public.motil_whatsapp_messages (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null,
  provider_message_id text not null check (char_length(provider_message_id) between 1 and 255),
  sender_chat_id text,
  sender_name text,
  body text,
  message_type text not null check (char_length(message_type) between 1 and 64),
  file_name text,
  quoted_message_id text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  foreign key (group_id, organization_id)
    references public.motil_whatsapp_groups(id, organization_id) on delete cascade,
  unique (group_id, provider_message_id),
  constraint motil_whatsapp_message_sizes check (
    char_length(coalesce(body, '')) <= 10000
    and char_length(coalesce(sender_chat_id, '')) <= 128
    and char_length(coalesce(sender_name, '')) <= 160
    and char_length(coalesce(file_name, '')) <= 255
    and char_length(coalesce(quoted_message_id, '')) <= 255
  )
);
create index if not exists motil_whatsapp_messages_daily_idx
  on public.motil_whatsapp_messages(organization_id, occurred_at, id);

create table if not exists public.motil_whatsapp_daily_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_date date not null,
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'partial', 'empty', 'failed')),
  message_count integer not null default 0 check (message_count >= 0),
  truncated boolean not null default false,
  summary text not null default '',
  findings jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array'),
  model_used text,
  error_code text,
  processing_lease_until timestamptz,
  generated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id, report_date)
);
create index if not exists motil_whatsapp_daily_reports_tenant_idx
  on public.motil_whatsapp_daily_reports(organization_id, report_date desc);

alter table public.motil_whatsapp_groups enable row level security;
alter table public.motil_whatsapp_messages enable row level security;
alter table public.motil_whatsapp_daily_reports enable row level security;
revoke all on public.motil_whatsapp_groups, public.motil_whatsapp_messages,
  public.motil_whatsapp_daily_reports from public, anon, authenticated;
grant all on public.motil_whatsapp_groups, public.motil_whatsapp_messages,
  public.motil_whatsapp_daily_reports to service_role;
grant usage, select on sequence public.motil_whatsapp_messages_id_seq to service_role;

-- Atomic lease: repeated Vercel cron invocations cannot pay for duplicate AI work.
create or replace function public.motil_whatsapp_claim_daily_report(
  p_organization_id uuid, p_report_date date
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare claimed_id uuid;
begin
  insert into public.motil_whatsapp_daily_reports
    (organization_id, report_date, status, processing_lease_until)
  values (p_organization_id, p_report_date, 'processing', now() + interval '6 minutes')
  on conflict (organization_id, report_date) do update
    set status = 'processing',
        processing_lease_until = now() + interval '6 minutes',
        error_code = null,
        updated_at = now()
    where public.motil_whatsapp_daily_reports.status in ('failed', 'partial')
      or (public.motil_whatsapp_daily_reports.status = 'processing'
          and public.motil_whatsapp_daily_reports.processing_lease_until < now())
  returning id into claimed_id;
  return claimed_id is not null;
end $$;

-- Chile-local day bounds avoid losing messages when Chile changes UTC offset.
create or replace function public.motil_whatsapp_daily_evidence(
  p_organization_id uuid, p_report_date date, p_limit integer default 251
) returns table (
  id bigint, group_name text, sender_name text, body text,
  message_type text, occurred_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select m.id, g.display_name, m.sender_name, m.body, m.message_type, m.occurred_at
  from public.motil_whatsapp_messages m
  join public.motil_whatsapp_groups g on g.id = m.group_id and g.organization_id = m.organization_id
  where m.organization_id = p_organization_id
    and g.enabled = true
    and m.occurred_at >= (p_report_date::timestamp at time zone 'America/Santiago')
    and m.occurred_at < ((p_report_date + 1)::timestamp at time zone 'America/Santiago')
  order by m.occurred_at, m.id
  limit least(greatest(p_limit, 1), 501)
$$;

revoke all on function public.motil_whatsapp_claim_daily_report(uuid,date)
  from public, anon, authenticated;
revoke all on function public.motil_whatsapp_daily_evidence(uuid,date,integer)
  from public, anon, authenticated;
grant execute on function public.motil_whatsapp_claim_daily_report(uuid,date) to service_role;
grant execute on function public.motil_whatsapp_daily_evidence(uuid,date,integer) to service_role;

comment on table public.motil_whatsapp_messages is
  'Quarantined WhatsApp group source evidence; never a canonical maintenance, HSE, or production fact.';
comment on table public.motil_whatsapp_daily_reports is
  'Derived daily intelligence for human review, with source message IDs for traceability.';
