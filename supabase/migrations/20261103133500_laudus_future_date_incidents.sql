-- Reconcile Laudus source date anomalies into the existing sync incident queue.

create or replace function public.motil_reconcile_laudus_data_quality_incidents(
  p_organization_id uuid,
  p_domain text,
  p_rule text,
  p_incidents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, pg_temp
as $$
declare
  v_source_id uuid;
  v_item jsonb;
  v_fingerprint text;
  v_seen text[] := array[]::text[];
  v_created integer := 0;
  v_updated integer := 0;
  v_resolved integer := 0;
begin
  if p_domain is null or btrim(p_domain) = '' then
    raise exception 'domain required';
  end if;
  if p_rule is null or btrim(p_rule) = '' then
    raise exception 'rule required';
  end if;
  if jsonb_typeof(coalesce(p_incidents, '[]'::jsonb)) <> 'array' then
    raise exception 'incidents must be an array';
  end if;

  select s.id into v_source_id
  from integration.external_sources s
  where s.organization_id=p_organization_id
    and s.source_key='laudus'
    and s.enabled=true
  limit 1;

  if v_source_id is null then
    raise exception 'laudus source unavailable';
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_incidents, '[]'::jsonb))
  loop
    v_fingerprint := nullif(btrim(v_item->>'fingerprint'), '');
    if v_fingerprint is null then
      continue;
    end if;

    v_seen := array_append(v_seen, v_fingerprint);

    update integration.sync_incidents
    set
      severity=case when v_item->>'severity' in ('info','warning','error','critical')
        then v_item->>'severity' else severity end,
      message=coalesce(nullif(v_item->>'message',''), message),
      details=coalesce(v_item->'details','{}'::jsonb) || jsonb_build_object(
        'quality_rule',p_rule,
        'source_truth','laudus',
        'canonical_mutated',false
      ),
      last_seen_at=now(),
      occurrence_count=occurrence_count+1,
      updated_at=now()
    where source_id=v_source_id
      and domain=p_domain
      and fingerprint=v_fingerprint
      and status='open';

    if found then
      v_updated := v_updated + 1;
    else
      insert into integration.sync_incidents (
        id, organization_id, source_id, domain, fingerprint, category, severity, status,
        message, details, first_seen_at, last_seen_at, occurrence_count, created_at, updated_at
      ) values (
        gen_random_uuid(), p_organization_id, v_source_id, p_domain, v_fingerprint,
        'data_quality',
        case when v_item->>'severity' in ('info','warning','error','critical')
          then v_item->>'severity' else 'warning' end,
        'open',
        coalesce(nullif(v_item->>'message',''), 'Laudus requiere revisión de calidad de datos.'),
        coalesce(v_item->'details','{}'::jsonb) || jsonb_build_object(
          'quality_rule',p_rule,
          'source_truth','laudus',
          'canonical_mutated',false
        ),
        now(), now(), 1, now(), now()
      );
      v_created := v_created + 1;
    end if;
  end loop;

  update integration.sync_incidents
  set
    status='resolved',
    resolved_at=now(),
    last_seen_at=now(),
    updated_at=now()
  where source_id=v_source_id
    and domain=p_domain
    and category='data_quality'
    and status='open'
    and details->>'quality_rule'=p_rule
    and not (fingerprint = any(v_seen));

  get diagnostics v_resolved = row_count;

  return jsonb_build_object(
    'created',v_created,
    'updated',v_updated,
    'resolved',v_resolved,
    'open',coalesce(array_length(v_seen,1),0)
  );
end;
$$;

revoke all on function public.motil_reconcile_laudus_data_quality_incidents(uuid,text,text,jsonb)
from public, anon, authenticated;
grant execute on function public.motil_reconcile_laudus_data_quality_incidents(uuid,text,text,jsonb)
to service_role;


create or replace function public.motil_get_laudus_data_quality_incident_summary(
  p_organization_id uuid
)
returns table(
  domain text,
  open_incidents bigint,
  critical_incidents bigint
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
    count(*) filter (where i.status='open' and i.severity='critical')::bigint as critical_incidents
  from integration.sync_incidents i
  where i.organization_id=p_organization_id
    and i.category='data_quality'
  group by i.domain;
end;
$$;

revoke all on function public.motil_get_laudus_data_quality_incident_summary(uuid)
from public, anon;
grant execute on function public.motil_get_laudus_data_quality_incident_summary(uuid)
to authenticated, service_role;
