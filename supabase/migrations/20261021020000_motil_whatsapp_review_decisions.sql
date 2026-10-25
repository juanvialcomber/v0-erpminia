-- Review decisions are independent of published operational activities.
create table if not exists public.motil_whatsapp_review_decisions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 message_id bigint not null references public.motil_whatsapp_messages(id) on delete restrict,
 item_index integer not null check (item_index >= 0),
 evidence_excerpt text not null,
 destination_module text,
 decision text not null check (decision in ('approved_for_review','discarded')),
 reviewer_id uuid not null,
 review_note text,
 reviewed_at timestamptz not null default now(),
 unique (organization_id,message_id,item_index)
);
create index if not exists motil_wa_review_org_message_idx on public.motil_whatsapp_review_decisions(organization_id,message_id);
alter table public.motil_whatsapp_review_decisions enable row level security;
revoke all on public.motil_whatsapp_review_decisions from anon,authenticated;

-- Explicit Data API contract; no new client access. RLS is unchanged.
-- Consumer: app/api/maintenance/whatsapp/review-decisions/route.ts
grant select, insert on table public.motil_whatsapp_review_decisions to service_role;
