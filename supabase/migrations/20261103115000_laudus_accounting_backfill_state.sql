-- Checkpointed, service-only historical accounting backfill for Laudus.

create table if not exists integration.laudus_accounting_backfill_state (
  organization_id uuid primary key,
  source_id uuid not null references integration.external_sources(id) on delete cascade,
  next_date_from date not null,
  next_offset integer not null default 0 check (next_offset >= 0),
  target_date date not null,
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  last_window_from date,
  last_window_to date,
  last_run_at timestamptz,
  last_error text,
  rows_read bigint not null default 0,
  rows_staged bigint not null default 0,
  duplicates_removed bigint not null default 0,
  api_calls integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table integration.laudus_accounting_backfill_state enable row level security;
revoke all on integration.laudus_accounting_backfill_state from public, anon, authenticated;
grant select, insert, update on integration.laudus_accounting_backfill_state to service_role;

create or replace function public.motil_get_laudus_accounting_backfill_state(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, pg_temp
as $$
declare
  v_source_id uuid;
  v_start date;
  v_state integration.laudus_accounting_backfill_state%rowtype;
begin
  select s.id into v_source_id
  from integration.external_sources s
  where s.organization_id=p_organization_id
    and s.source_key='laudus'
    and s.enabled=true
  limit 1;

  if v_source_id is null then raise exception 'laudus source unavailable'; end if;

  with days as (
    select distinct e.entry_date::date as d
    from integration.laudus_accounting_entries e
    where e.organization_id=p_organization_id
  ),
  gaps as (
    select
      d,
      lag(d) over(order by d) as prev_d,
      d - lag(d) over(order by d) as gap_days
    from days
  )
  select coalesce(
    (
      select g.prev_d + 1
      from gaps g
      where g.gap_days > 31
      order by g.prev_d
      limit 1
    ),
    (
      select max(d) + 1
      from days
    ),
    date '2019-01-01'
  )
  into v_start;

  insert into integration.laudus_accounting_backfill_state (
    organization_id, source_id, next_date_from, next_offset, target_date, status
  ) values (
    p_organization_id, v_source_id, v_start, 0, current_date,
    case when v_start > current_date then 'completed' else 'pending' end
  )
  on conflict (organization_id) do nothing;

  select * into v_state
  from integration.laudus_accounting_backfill_state
  where organization_id=p_organization_id;

  return to_jsonb(v_state);
end;
$$;

revoke all on function public.motil_get_laudus_accounting_backfill_state(uuid)
from public, anon, authenticated;
grant execute on function public.motil_get_laudus_accounting_backfill_state(uuid)
to service_role;

create or replace function public.motil_update_laudus_accounting_backfill_state(
  p_organization_id uuid,
  p_window_from date,
  p_window_to date,
  p_next_date_from date,
  p_next_offset integer,
  p_status text,
  p_rows_read bigint default 0,
  p_rows_staged bigint default 0,
  p_duplicates_removed bigint default 0,
  p_api_calls integer default 0,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, pg_temp
as $$
declare
  v_state integration.laudus_accounting_backfill_state%rowtype;
begin
  if p_status not in ('pending','running','completed','failed') then
    raise exception 'invalid backfill status';
  end if;

  update integration.laudus_accounting_backfill_state
  set
    next_date_from=p_next_date_from,
    next_offset=greatest(coalesce(p_next_offset,0),0),
    status=p_status,
    last_window_from=p_window_from,
    last_window_to=p_window_to,
    last_run_at=now(),
    last_error=left(p_error,1000),
    rows_read=rows_read + greatest(coalesce(p_rows_read,0),0),
    rows_staged=rows_staged + greatest(coalesce(p_rows_staged,0),0),
    duplicates_removed=duplicates_removed + greatest(coalesce(p_duplicates_removed,0),0),
    api_calls=api_calls + greatest(coalesce(p_api_calls,0),0),
    target_date=greatest(target_date,current_date),
    updated_at=now()
  where organization_id=p_organization_id
  returning * into v_state;

  if v_state.organization_id is null then raise exception 'backfill state unavailable'; end if;
  return to_jsonb(v_state);
end;
$$;

revoke all on function public.motil_update_laudus_accounting_backfill_state(
  uuid,date,date,date,integer,text,bigint,bigint,bigint,integer,text
) from public, anon, authenticated;
grant execute on function public.motil_update_laudus_accounting_backfill_state(
  uuid,date,date,date,integer,text,bigint,bigint,bigint,integer,text
) to service_role;
