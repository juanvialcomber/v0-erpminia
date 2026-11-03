-- Lease-protected accounting backfill execution.
-- Prevents concurrent Vercel cron/manual/fallback runs from consuming the same Laudus pages.

alter table integration.laudus_accounting_backfill_state
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz;

create or replace function public.motil_acquire_laudus_accounting_backfill_lease(
  p_organization_id uuid,
  p_lease_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, pg_temp
as $$
declare
  v_token uuid := gen_random_uuid();
  v_state integration.laudus_accounting_backfill_state%rowtype;
  v_minutes integer := least(greatest(coalesce(p_lease_minutes, 30), 5), 60);
begin
  -- Ensure state exists before attempting the atomic lease.
  perform public.motil_get_laudus_accounting_backfill_state(p_organization_id);

  update integration.laudus_accounting_backfill_state
  set
    lease_token = v_token,
    lease_expires_at = now() + make_interval(mins => v_minutes),
    status = case when status = 'completed' then status else 'running' end,
    updated_at = now()
  where organization_id = p_organization_id
    and status <> 'completed'
    and (lease_expires_at is null or lease_expires_at <= now())
  returning * into v_state;

  if v_state.organization_id is null then
    return jsonb_build_object('acquired', false);
  end if;

  return jsonb_build_object(
    'acquired', true,
    'lease_token', v_token,
    'lease_expires_at', v_state.lease_expires_at,
    'state', to_jsonb(v_state)
  );
end;
$$;

revoke all on function public.motil_acquire_laudus_accounting_backfill_lease(uuid,integer)
from public, anon, authenticated;
grant execute on function public.motil_acquire_laudus_accounting_backfill_lease(uuid,integer)
to service_role;

create or replace function public.motil_checkpoint_laudus_accounting_backfill_v2(
  p_organization_id uuid,
  p_lease_token uuid,
  p_window_from date,
  p_window_to date,
  p_next_date_from date,
  p_next_offset integer,
  p_status text,
  p_rows_read bigint default 0,
  p_rows_staged bigint default 0,
  p_duplicates_removed bigint default 0,
  p_api_calls integer default 0,
  p_error text default null,
  p_lease_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, pg_temp
as $$
declare
  v_state integration.laudus_accounting_backfill_state%rowtype;
  v_minutes integer := least(greatest(coalesce(p_lease_minutes, 30), 5), 60);
begin
  if p_status not in ('pending','running','completed','failed') then
    raise exception 'invalid backfill status';
  end if;

  update integration.laudus_accounting_backfill_state
  set
    next_date_from = p_next_date_from,
    next_offset = greatest(coalesce(p_next_offset, 0), 0),
    status = p_status,
    last_window_from = p_window_from,
    last_window_to = p_window_to,
    last_run_at = now(),
    last_error = left(p_error, 1000),
    rows_read = rows_read + greatest(coalesce(p_rows_read, 0), 0),
    rows_staged = rows_staged + greatest(coalesce(p_rows_staged, 0), 0),
    duplicates_removed = duplicates_removed + greatest(coalesce(p_duplicates_removed, 0), 0),
    api_calls = api_calls + greatest(coalesce(p_api_calls, 0), 0),
    target_date = greatest(target_date, current_date),
    lease_expires_at = case
      when p_status in ('completed','failed') then null
      else now() + make_interval(mins => v_minutes)
    end,
    lease_token = case
      when p_status in ('completed','failed') then null
      else lease_token
    end,
    updated_at = now()
  where organization_id = p_organization_id
    and lease_token = p_lease_token
    and lease_expires_at > now()
  returning * into v_state;

  if v_state.organization_id is null then
    raise exception 'backfill lease unavailable or expired';
  end if;

  return to_jsonb(v_state);
end;
$$;

revoke all on function public.motil_checkpoint_laudus_accounting_backfill_v2(
  uuid,uuid,date,date,date,integer,text,bigint,bigint,bigint,integer,text,integer
) from public, anon, authenticated;
grant execute on function public.motil_checkpoint_laudus_accounting_backfill_v2(
  uuid,uuid,date,date,date,integer,text,bigint,bigint,bigint,integer,text,integer
) to service_role;

create or replace function public.motil_release_laudus_accounting_backfill_lease(
  p_organization_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, integration, pg_temp
as $$
declare
  v_released boolean := false;
begin
  update integration.laudus_accounting_backfill_state
  set
    lease_token = null,
    lease_expires_at = null,
    status = case when status = 'running' then 'pending' else status end,
    updated_at = now()
  where organization_id = p_organization_id
    and lease_token = p_lease_token;

  v_released := found;
  return v_released;
end;
$$;

revoke all on function public.motil_release_laudus_accounting_backfill_lease(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.motil_release_laudus_accounting_backfill_lease(uuid,uuid)
to service_role;
