-- Private WhatsApp media evidence. Isolated from canonical documents/OT/HSE.
create table if not exists public.motil_whatsapp_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id bigint not null unique references public.motil_whatsapp_messages(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null,
  provider_message_id text not null check (char_length(provider_message_id) between 1 and 255),
  message_type text not null,
  original_file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes between 0 and 15728640),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text unique,
  download_status text not null default 'pending'
    check (download_status in ('pending','processing','retry','stored','unavailable','unsupported')),
  download_attempts integer not null default 0 check (download_attempts between 0 and 10),
  download_lease_until timestamptz,
  download_next_at timestamptz not null default now(),
  download_error_code text,
  downloaded_at timestamptz,
  scan_status text not null default 'waiting'
    check (scan_status in ('waiting','pending','processing','retry','review_ready','manual')),
  scan_attempts integer not null default 0 check (scan_attempts between 0 and 10),
  scan_lease_until timestamptz,
  scan_next_at timestamptz not null default now(),
  scan_error_code text,
  scan_model text,
  scan_schema_version integer,
  extraction_json jsonb not null default '{}'::jsonb check (jsonb_typeof(extraction_json)='object'),
  scanned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (group_id,organization_id)
    references public.motil_whatsapp_groups(id,organization_id) on delete cascade
);
create index if not exists motil_whatsapp_attachments_download_idx
  on public.motil_whatsapp_attachments(download_status,download_next_at,created_at);
create index if not exists motil_whatsapp_attachments_scan_idx
  on public.motil_whatsapp_attachments(scan_status,scan_next_at,created_at);
create index if not exists motil_whatsapp_attachments_org_idx
  on public.motil_whatsapp_attachments(organization_id,created_at desc);

alter table public.motil_whatsapp_attachments enable row level security;
revoke all on public.motil_whatsapp_attachments from public,anon,authenticated;
grant select,insert,update,delete on public.motil_whatsapp_attachments to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('motil-whatsapp-evidence','motil-whatsapp-evidence',false,15728640,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif',
        'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword','application/vnd.ms-excel',
        'audio/mpeg','audio/ogg','audio/mp4','video/mp4'])
on conflict (id) do nothing;

-- Raw message stays authoritative; create one fetch job for each message with media.
create or replace function public.motil_whatsapp_enqueue_attachment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.message_type in ('imageMessage','documentMessage','audioMessage','videoMessage','stickerMessage') then
    insert into public.motil_whatsapp_attachments
      (message_id,organization_id,group_id,provider_message_id,message_type,original_file_name)
    values
      (new.id,new.organization_id,new.group_id,new.provider_message_id,new.message_type,new.file_name)
    on conflict (message_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.motil_whatsapp_enqueue_attachment() from public,anon,authenticated;
drop trigger if exists motil_whatsapp_messages_enqueue_media on public.motil_whatsapp_messages;
create trigger motil_whatsapp_messages_enqueue_media
after insert on public.motil_whatsapp_messages for each row
execute function public.motil_whatsapp_enqueue_attachment();

insert into public.motil_whatsapp_attachments
  (message_id,organization_id,group_id,provider_message_id,message_type,original_file_name)
select m.id,m.organization_id,m.group_id,m.provider_message_id,m.message_type,m.file_name
from public.motil_whatsapp_messages m
where m.message_type in ('imageMessage','documentMessage','audioMessage','videoMessage','stickerMessage')
on conflict (message_id) do nothing;

-- Atomic bounded claims avoid overlapping Vercel crons and reclaim timed-out jobs.
create or replace function public.motil_whatsapp_claim_download(p_limit integer default 2)
returns table(job_id uuid, source_message_id bigint, org_id uuid, source_group_id uuid,
  source_chat_id text, source_provider_id text, source_type text, source_name text, attempt_no integer)
language sql security definer set search_path = '' as $$
with picked as (
  select a.id from public.motil_whatsapp_attachments a
  join public.motil_whatsapp_groups g on g.id=a.group_id and g.organization_id=a.organization_id
  where g.enabled = true and a.download_attempts < 5
    and ((a.download_status in ('pending','retry') and a.download_next_at <= now())
      or (a.download_status='processing' and a.download_lease_until < now()))
  order by a.created_at,a.id
  for update of a skip locked
  limit least(greatest(p_limit,1),3)
), updated as (
  update public.motil_whatsapp_attachments a
  set download_status='processing',download_attempts=a.download_attempts+1,
      download_lease_until=now()+interval '120 seconds',updated_at=now()
  from picked p where a.id=p.id
  returning a.id,a.message_id,a.organization_id,a.group_id,a.provider_message_id,
            a.message_type,a.original_file_name,a.download_attempts
)
select u.id,u.message_id,u.organization_id,u.group_id,g.chat_id,u.provider_message_id,
       u.message_type,u.original_file_name,u.download_attempts
from updated u join public.motil_whatsapp_groups g on g.id=u.group_id and g.organization_id=u.organization_id
$$;
revoke all on function public.motil_whatsapp_claim_download(integer) from public,anon,authenticated;
grant execute on function public.motil_whatsapp_claim_download(integer) to service_role;

create or replace function public.motil_whatsapp_claim_scan(p_limit integer default 1)
returns table(job_id uuid, org_id uuid, source_group_id uuid, storage_key text, media_mime text, attempt_no integer)
language sql security definer set search_path = '' as $$
with picked as (
  select a.id from public.motil_whatsapp_attachments a
  join public.motil_whatsapp_groups g on g.id=a.group_id and g.organization_id=a.organization_id
  where g.enabled=true and a.download_status='stored' and a.scan_attempts < 3
    and ((a.scan_status in ('pending','retry') and a.scan_next_at<=now())
      or (a.scan_status='processing' and a.scan_lease_until < now()))
  order by a.downloaded_at,a.id
  for update of a skip locked
  limit least(greatest(p_limit,1),1)
), updated as (
  update public.motil_whatsapp_attachments a
  set scan_status='processing',scan_attempts=a.scan_attempts+1,
      scan_lease_until=now()+interval '180 seconds',updated_at=now()
  from picked p where a.id=p.id
  returning a.id,a.organization_id,a.group_id,a.storage_path,a.mime_type,a.scan_attempts
)
select u.id,u.organization_id,u.group_id,u.storage_path,u.mime_type,u.scan_attempts from updated u
$$;
revoke all on function public.motil_whatsapp_claim_scan(integer) from public,anon,authenticated;
grant execute on function public.motil_whatsapp_claim_scan(integer) to service_role;

comment on table public.motil_whatsapp_attachments is
  'Private source evidence linked one-to-one to Green API message. AI extraction is a review-only annotation, not canonical truth.';
