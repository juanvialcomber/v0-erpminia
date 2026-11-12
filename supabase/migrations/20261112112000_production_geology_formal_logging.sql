-- Geological logging is professional interpretation, not drilling source evidence.
-- Read-only in production until the corresponding reviewed API is released.
-- No automatic migration from production_drill_intervals or chemistry samples.

create table if not exists public.production_geology_formal_intervals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  drill_hole_id uuid not null references public.production_drill_holes(id),
  from_m numeric(12,3) not null,
  to_m numeric(12,3) not null,
  observed_on date not null,
  source_reference text not null,
  lithology text,
  alteration text,
  mineralization text,
  structures text,
  recovery_pct numeric(6,3),
  rqd_pct numeric(6,3),
  field_notes text,
  status text not null default 'draft',
  created_by uuid not null,
  last_actor_id uuid not null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  reviewer_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint geology_formal_interval_depth_check check (from_m >= 0 and to_m > from_m),
  constraint geology_formal_recovery_check check (recovery_pct is null or (recovery_pct between 0 and 100)),
  constraint geology_formal_rqd_check check (rqd_pct is null or (rqd_pct between 0 and 100)),
  constraint geology_formal_status_check check (status in ('draft','submitted','validated','rejected')),
  constraint geology_formal_source_check check (char_length(trim(source_reference)) between 3 and 500),
  constraint geology_formal_review_check check (
    status not in ('validated','rejected') or
    (reviewed_by is not null and reviewed_at is not null and
     reviewed_by <> created_by and char_length(trim(coalesce(reviewer_comment,''))) >= 10)
  )
);

create unique index if not exists geology_formal_source_interval_uidx
  on public.production_geology_formal_intervals
  (organization_id, drill_hole_id, from_m, to_m, source_reference);

create index if not exists geology_formal_hole_depth_idx
  on public.production_geology_formal_intervals
  (organization_id, drill_hole_id, from_m, updated_at desc);

create table if not exists public.production_geology_formal_interval_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  interval_id uuid not null references public.production_geology_formal_intervals(id),
  actor_id uuid not null,
  event_type text not null check (event_type in ('create','revise','submit','validate','reject')),
  previous_status text,
  next_status text not null,
  before_record jsonb,
  after_record jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists geology_formal_events_scope_idx
  on public.production_geology_formal_interval_events
  (organization_id, interval_id, created_at desc);

create or replace function public.guard_production_geology_formal_interval()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $$
begin
  if not exists (
    select 1 from public.production_drill_holes h
    where h.id = new.drill_hole_id and h.organization_id = new.organization_id
  ) then
    raise exception 'El sondaje no pertenece a esta organización' using errcode = '23503';
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'validated' then
      raise exception 'Un registro validado es inmutable; crear una nueva revisión documentada' using errcode = '23514';
    end if;
    if new.id is distinct from old.id
       or new.organization_id is distinct from old.organization_id
       or new.drill_hole_id is distinct from old.drill_hole_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'No se permite cambiar el origen ni el autor del registro' using errcode = '23514';
    end if;
    new.updated_at := clock_timestamp();
  end if;

  if new.status in ('validated', 'rejected') and
     (new.reviewed_by is null or new.reviewed_by = new.created_by
      or char_length(trim(coalesce(new.reviewer_comment,''))) < 10
      or new.reviewed_at is null) then
    raise exception 'La revisión requiere otro geólogo, comentario y fecha' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists geology_formal_guard_trg on public.production_geology_formal_intervals;
create trigger geology_formal_guard_trg
before insert or update on public.production_geology_formal_intervals
for each row execute function public.guard_production_geology_formal_interval();

create or replace function public.audit_production_geology_formal_interval()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'create';
  elsif old.status is distinct from new.status and new.status = 'submitted' then
    v_action := 'submit';
  elsif old.status is distinct from new.status and new.status = 'validated' then
    v_action := 'validate';
  elsif old.status is distinct from new.status and new.status = 'rejected' then
    v_action := 'reject';
  else
    v_action := 'revise';
  end if;
  insert into public.production_geology_formal_interval_events (
    organization_id, interval_id, actor_id, event_type,
    previous_status, next_status, before_record, after_record
  ) values (
    new.organization_id, new.id, new.last_actor_id, v_action,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists geology_formal_audit_trg on public.production_geology_formal_intervals;
create trigger geology_formal_audit_trg
after insert or update on public.production_geology_formal_intervals
for each row execute function public.audit_production_geology_formal_interval();

-- These tables are accessed only through server routes that enforce ED/LEC,
-- tenant membership, and the geology-specific human approval workflow.
alter table public.production_geology_formal_intervals enable row level security;
alter table public.production_geology_formal_interval_events enable row level security;
revoke all on public.production_geology_formal_intervals from public, anon, authenticated;
revoke all on public.production_geology_formal_interval_events from public, anon, authenticated;
grant select, insert, update on public.production_geology_formal_intervals to service_role;
grant select, insert on public.production_geology_formal_interval_events to service_role;
grant usage, select on sequence public.production_geology_formal_interval_events_id_seq to service_role;
revoke execute on function public.guard_production_geology_formal_interval() from public, anon, authenticated;
revoke execute on function public.audit_production_geology_formal_interval() from public, anon, authenticated;
