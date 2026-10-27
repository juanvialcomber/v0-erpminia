-- Promote accepted Asset 360 creation requests into canonical assets.
-- Uses only accepted identity evidence. Idempotent and conflict-safe.

create or replace function public.motil_promote_asset_creation_requests(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = 'public','canonical','staging','pg_temp'
as $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
  v_row record;
  v_stage record;
  v_existing canonical.assets%rowtype;
  v_batch_id uuid;
  v_asset_id uuid;
  v_asset_code text;
  v_name text;
  v_kind text;
  v_ident text;
  v_plate text;
  v_serial text;
  v_historical_cost_center text;
  v_applied integer := 0;
  v_conflicts integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if p_organization_id is null or p_actor_user_id is null then
    raise exception 'organization and actor are required';
  end if;

  insert into staging.import_batches(
    organization_id,source_file,source_file_sha256,source_type,status,
    total_rows,valid_rows,warning_rows,error_rows,metadata,validated_at
  )
  values(
    p_organization_id,
    'MOTIL · Canonicalización Ficha 360 · 2026-10-27',
    md5(p_organization_id::text||':asset_creation_requests:2026-10-27'),
    'asset_creation_requests',
    'validated',0,0,0,0,
    jsonb_build_object(
      'source','MOTIL reconciliation',
      'actor_user_id',p_actor_user_id,
      'canonical_promotion',true
    ),
    now()
  )
  on conflict (organization_id,source_file_sha256,source_type)
  do update set metadata=staging.import_batches.metadata||excluded.metadata,
                validated_at=coalesce(staging.import_batches.validated_at,excluded.validated_at)
  returning id into v_batch_id;

  for v_row in
    select q.*,r.issue_key,r.evidence_reference,r.resolution_note,r.status review_status
    from public.asset_creation_requests q
    join public.data_reconciliation_reviews r on r.id=q.reconciliation_review_id
    where q.organization_id=p_organization_id
      and q.state in ('awaiting_code','ready_to_create')
      and r.status='accepted'
    order by q.created_at,q.id
    limit v_limit
    for update of q
  loop
    v_kind := split_part(v_row.candidate_key,':',1);
    v_ident := upper(regexp_replace(split_part(v_row.candidate_key,':',2),'[^A-Za-z0-9]','','g'));

    if v_kind not in ('plate','serial') or nullif(v_ident,'') is null then
      update public.asset_creation_requests
      set state='conflict',conflict_reason='unsupported_canonical_identity',updated_at=now()
      where id=v_row.id;
      v_conflicts := v_conflicts+1;
      continue;
    end if;

    if v_kind='plate' then
      v_plate := case
        when length(v_ident)=6 then substr(v_ident,1,4)||'-'||substr(v_ident,5,2)
        else v_ident
      end;
      v_serial := null;
      v_asset_code := v_plate;
    else
      v_plate := null;
      v_serial := v_ident;
      v_asset_code := v_serial;
    end if;

    select *
    into v_existing
    from canonical.assets a
    where a.organization_id=p_organization_id
      and (
        (v_kind='plate' and upper(regexp_replace(coalesce(a.license_plate,''),'[^A-Za-z0-9]','','g'))=v_ident)
        or
        (v_kind='serial' and upper(regexp_replace(coalesce(a.serial_number,''),'[^A-Za-z0-9]','','g'))=v_ident)
        or a.asset_code=v_asset_code
      )
    limit 1;

    if found then
      update public.asset_creation_requests
      set state='created',proposed_asset_code=v_existing.asset_code,
          canonical_asset_id=v_existing.id,created_by=p_actor_user_id,
          canonical_created_at=coalesce(canonical_created_at,now()),
          conflict_reason=null,updated_at=now()
      where id=v_row.id;

      update public.data_reconciliation_reviews
      set status='resolved',
          resolution_note=coalesce(resolution_note,'')||
            case when coalesce(resolution_note,'')='' then '' else E'\n' end||
            'Ficha 360 canónica vinculada al activo '||v_existing.asset_code||'.',
          updated_at=now()
      where id=v_row.reconciliation_review_id and status='accepted';

      v_results := v_results||jsonb_build_array(jsonb_build_object(
        'candidate_key',v_row.candidate_key,'state','linked_existing',
        'asset_id',v_existing.id,'asset_code',v_existing.asset_code));
      continue;
    end if;

    select s.*
    into v_stage
    from public.motil_finance_asset_stage s
    where s.organization_id=p_organization_id
      and (
        (v_kind='plate' and upper(regexp_replace(coalesce(s.license_plate,''),'[^A-Za-z0-9]','','g'))=v_ident)
        or
        (v_kind='serial' and upper(regexp_replace(coalesce(s.serial_number,''),'[^A-Za-z0-9]','','g'))=v_ident)
      )
    order by
      case s.record_kind when 'insurance' then 1 when 'depreciation' then 2 else 3 end,
      s.source_row
    limit 1;

    v_historical_cost_center := substring(v_row.evidence_reference from 'centro de costo compras: ([0-9]+-[0-9]+)');

    if v_stage.record_kind is not null then
      v_name := coalesce(
        nullif(trim(concat_ws(' ',v_stage.brand,v_stage.model,
          case when v_kind='plate' then v_plate else null end)), ''),
        nullif(trim(v_stage.description),''),
        case when v_kind='plate' then 'Vehículo '||v_plate else 'Equipo '||v_serial end
      );
    else
      v_name := coalesce(
        nullif(trim(substring(v_row.evidence_reference from 'centro de costo compras: [0-9]+-[0-9]+ ([^|]+)')),''),
        case when v_kind='plate' then 'Vehículo '||v_plate else 'Equipo '||v_serial end
      );
    end if;

    insert into canonical.assets(
      organization_id,asset_code,name,asset_type,category,manufacturer,model,
      serial_number,license_plate,cost_center_code,is_active,validation_status,
      validation_notes,source_file,source_sheet,source_row,import_batch_id,
      source_hash,source_payload
    )
    values(
      p_organization_id,
      v_asset_code,
      v_name,
      case when v_kind='plate' then 'vehicle' else 'equipment' end,
      case when v_kind='plate' then 'vehicle' else 'equipment' end,
      nullif(trim(v_stage.brand),''),
      nullif(trim(v_stage.model),''),
      coalesce(nullif(trim(v_stage.serial_number),''),v_serial),
      coalesce(nullif(trim(v_stage.license_plate),''),v_plate),
      case when exists(
        select 1 from canonical.cost_centers c
        where c.organization_id=p_organization_id
          and c.cost_center_code=v_historical_cost_center
          and c.is_active
      ) then v_historical_cost_center else null end,
      true,
      'valid',
      array[
        'Alta canónica desde revisión humana aceptada.',
        'Identidad exacta: '||v_row.candidate_key||'.',
        case when v_historical_cost_center is not null
          then 'Centro de costo histórico observado: '||v_historical_cost_center||'.'
          else 'Sin centro de costo canónico asignado en la evidencia actual.'
        end
      ],
      'MOTIL · Reconciliación canónica de activos',
      coalesce(v_stage.source_sheet,'asset_creation_requests'),
      coalesce(v_stage.source_row,1),
      v_batch_id,
      md5(p_organization_id::text||':'||v_row.candidate_key),
      coalesce(v_stage.source_payload,'{}'::jsonb)||jsonb_build_object(
        'candidate_key',v_row.candidate_key,
        'reconciliation_review_id',v_row.reconciliation_review_id,
        'reconciliation_evidence',v_row.evidence_reference,
        'canonicalized_at',now(),
        'canonicalized_by',p_actor_user_id,
        'historical_cost_center_code',v_historical_cost_center,
        'historical_cost_center_promoted',
          exists(select 1 from canonical.cost_centers c
            where c.organization_id=p_organization_id
              and c.cost_center_code=v_historical_cost_center and c.is_active)
      )
    )
    returning id into v_asset_id;

    update public.asset_creation_requests
    set state='created',proposed_asset_code=v_asset_code,
        canonical_asset_id=v_asset_id,created_by=p_actor_user_id,
        canonical_created_at=now(),conflict_reason=null,updated_at=now()
    where id=v_row.id;

    update public.data_reconciliation_reviews
    set status='resolved',
        resolution_note=coalesce(resolution_note,'')||
          case when coalesce(resolution_note,'')='' then '' else E'\n' end||
          'Ficha 360 canónica creada como '||v_asset_code||'.',
        updated_at=now()
    where id=v_row.reconciliation_review_id and status='accepted';

    v_applied := v_applied+1;
    v_results := v_results||jsonb_build_array(jsonb_build_object(
      'candidate_key',v_row.candidate_key,'state','created',
      'asset_id',v_asset_id,'asset_code',v_asset_code));
  end loop;

  update staging.import_batches
  set status='promoted',promoted_at=now(),
      total_rows=(select count(*) from public.asset_creation_requests q
                  where q.organization_id=p_organization_id
                    and q.canonical_created_at is not null),
      valid_rows=(select count(*) from public.asset_creation_requests q
                  where q.organization_id=p_organization_id and q.state='created')
  where id=v_batch_id;

  return jsonb_build_object(
    'created',v_applied,
    'conflicts',v_conflicts,
    'canonical_mutated',v_applied>0,
    'results',v_results
  );
end;
$function$;

revoke all on function public.motil_promote_asset_creation_requests(uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.motil_promote_asset_creation_requests(uuid,uuid,integer)
  to service_role;

comment on function public.motil_promote_asset_creation_requests(uuid,uuid,integer)
is 'Promotes accepted Asset 360 requests using exact plate/serial identity, preserving reconciliation evidence and preventing duplicate canonical identities.';