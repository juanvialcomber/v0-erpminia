-- Tenant-checked severity-aware Laudus data-quality summary for Data Health.

create or replace function public.motil_get_laudus_data_quality_incident_summary_v2(
  p_organization_id uuid
)
returns table(
  domain text,
  open_incidents bigint,
  critical_incidents bigint,
  error_incidents bigint,
  warning_incidents bigint
)
language plpgsql
security definer
set search_path = public, integration, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1
    from public.auth_profile_identity_links l
    join public.profiles p on p.id=l.profile_id
    where l.auth_user_id=v_user
      and p.status='active'
      and p.organization_id=p_organization_id
  ) then
    raise exception 'organization_access_denied';
  end if;

  return query
  select
    i.domain,
    count(*) filter (where i.status='open')::bigint as open_incidents,
    count(*) filter (where i.status='open' and i.severity='critical')::bigint as critical_incidents,
    count(*) filter (where i.status='open' and i.severity='error')::bigint as error_incidents,
    count(*) filter (where i.status='open' and i.severity='warning')::bigint as warning_incidents
  from integration.sync_incidents i
  where i.organization_id=p_organization_id
    and i.category='data_quality'
  group by i.domain;
end;
$$;

revoke all on function public.motil_get_laudus_data_quality_incident_summary_v2(uuid)
from public, anon;
grant execute on function public.motil_get_laudus_data_quality_incident_summary_v2(uuid)
to authenticated, service_role;
