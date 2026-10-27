-- Safe application of human-approved Laudus cost centers into MOTIL canonical cost centers.
-- Only deterministic, asset-backed proposals are eligible.
-- No Laudus write-back is performed.

create or replace function public.motil_apply_approved_laudus_cost_centers(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = 'public','integration','canonical','staging','pg_temp'
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,25),100));
  v_row record;
  v_parent canonical.cost_centers%rowtype;
  v_existing canonical.cost_centers%rowtype;
  v_asset canonical.assets%rowtype;
  v_batch_id uuid;
  v_canonical_id uuid;
  v_applied integer := 0;
  v_skipped integer := 0;
  v_conflicts integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_plate_snapshot text;
  v_asset_id uuid;
  v_parent_code text;
  v_center_type text;
begin
  if p_organization_id is null or p_actor_user_id is null then
    raise exception 'organization and actor are required';
  end if;

  for v_row in
    select
      d.id decision_id,
      d.laudus_external_id,
      d.operational_code,
      d.proposal_snapshot,
      l.id laudus_row_id,
      l.source_id,
      l.cost_center_code,
      l.name laudus_name,
      l.full_path laudus_full_path,
      l.parent_external_id,
      l.payload_hash,
      l.source_payload,
      l.reconciliation_status,
      l.discontinued
    from public.laudus_cost_center_review_decisions d
    join integration.laudus_cost_centers l
      on l.organization_id=d.organization_id
     and l.external_id=d.laudus_external_id
    where d.organization_id=p_organization_id
      and d.decision='approve_proposal'
      and l.reconciliation_status='pending'
      and not l.discontinued
    order by d.decided_at nulls last,d.laudus_external_id
    limit v_limit
    for update of l
  loop
    if coalesce(v_row.proposal_snapshot->>'evidence_level','') <> 'strong_asset_backed_proposal'
       or coalesce((v_row.proposal_snapshot->>'exact_plate_asset_support')::boolean,false) is not true
       or nullif(trim(v_row.operational_code),'') is null
       or nullif(trim(v_row.proposal_snapshot->>'asset_id'),'') is null
       or nullif(trim(v_row.proposal_snapshot->>'license_plate'),'') is null
       or nullif(trim(v_row.proposal_snapshot->>'parent_operational_code'),'') is null then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'laudus_external_id',v_row.laudus_external_id,
        'state','skipped',
        'reason','approval_snapshot_not_deterministic'
      ));
      continue;
    end if;

    v_asset_id := (v_row.proposal_snapshot->>'asset_id')::uuid;
    v_plate_snapshot := upper(regexp_replace(v_row.proposal_snapshot->>'license_plate','[^A-Za-z0-9]','','g'));
    v_parent_code := trim(v_row.proposal_snapshot->>'parent_operational_code');
    v_center_type := coalesce(nullif(trim(v_row.proposal_snapshot->>'suggested_center_type'),''),'unclassified');

    select *
      into v_asset
    from canonical.assets a
    where a.organization_id=p_organization_id
      and a.id=v_asset_id
      and upper(regexp_replace(coalesce(a.license_plate,''),'[^A-Za-z0-9]','','g'))=v_plate_snapshot;

    if not found then
      v_conflicts := v_conflicts + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'laudus_external_id',v_row.laudus_external_id,
        'state','conflict',
        'reason','canonical_asset_or_plate_changed'
      ));
      continue;
    end if;

    select *
      into v_parent
    from canonical.cost_centers c
    where c.organization_id=p_organization_id
      and c.cost_center_code=v_parent_code
      and c.is_active;

    if not found then
      v_conflicts := v_conflicts + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'laudus_external_id',v_row.laudus_external_id,
        'state','conflict',
        'reason','canonical_parent_missing'
      ));
      continue;
    end if;

    select *
      into v_existing
    from canonical.cost_centers c
    where c.organization_id=p_organization_id
      and c.cost_center_code=v_row.operational_code;

    if found then
      v_conflicts := v_conflicts + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'laudus_external_id',v_row.laudus_external_id,
        'state','conflict',
        'reason','canonical_code_already_exists',
        'canonical_cost_center_id',v_existing.id
      ));
      continue;
    end if;

    insert into staging.import_batches(
      organization_id,source_file,source_file_sha256,source_type,status,
      total_rows,valid_rows,warning_rows,error_rows,metadata,validated_at
    )
    values(
      p_organization_id,
      'Laudus ERP · Centro de costo '||v_row.laudus_external_id,
      v_row.payload_hash,
      'laudus_cost_center',
      'validated',
      1,1,0,0,
      jsonb_build_object(
        'source','Laudus ERP',
        'source_id',v_row.source_id,
        'external_id',v_row.laudus_external_id,
        'decision_id',v_row.decision_id,
        'actor_user_id',p_actor_user_id,
        'read_only_source',true
      ),
      now()
    )
    on conflict (organization_id,source_file_sha256,source_type)
    do update set
      metadata=staging.import_batches.metadata || excluded.metadata,
      validated_at=coalesce(staging.import_batches.validated_at,excluded.validated_at)
    returning id into v_batch_id;

    insert into canonical.cost_centers(
      organization_id,cost_center_code,name,full_path,parent_code,center_type,
      is_active,validation_status,validation_notes,
      source_file,source_sheet,source_row,import_batch_id,source_hash,source_payload
    )
    values(
      p_organization_id,
      v_row.operational_code,
      v_row.laudus_name,
      v_row.laudus_full_path,
      v_parent.cost_center_code,
      v_center_type,
      true,
      'valid',
      array[
        'Alta desde Laudus aprobada por revisión humana.',
        'Identidad respaldada por patente exacta contra activo MOTIL '||coalesce(v_asset.asset_code,v_asset.id::text)||'.'
      ],
      'Laudus ERP · Centro de costo '||v_row.laudus_external_id,
      'cost_centers',
      1,
      v_batch_id,
      v_row.payload_hash,
      coalesce(v_row.source_payload,'{}'::jsonb) || jsonb_build_object(
        'laudus_external_id',v_row.laudus_external_id,
        'laudus_source_id',v_row.source_id,
        'reconciliation_decision_id',v_row.decision_id,
        'reconciliation_actor_user_id',p_actor_user_id,
        'evidence_level','strong_asset_backed_proposal',
        'exact_plate_asset_support',true,
        'canonical_asset_id',v_asset.id,
        'canonical_asset_code',v_asset.asset_code,
        'canonical_license_plate',v_asset.license_plate
      )
    )
    returning id into v_canonical_id;

    update integration.laudus_cost_centers
    set canonical_cost_center_id=v_canonical_id,
        reconciliation_status='matched'
    where id=v_row.laudus_row_id
      and organization_id=p_organization_id
      and reconciliation_status='pending';

    update staging.import_batches
    set status='promoted',promoted_at=now()
    where id=v_batch_id;

    v_applied := v_applied + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'laudus_external_id',v_row.laudus_external_id,
      'state','applied',
      'canonical_cost_center_id',v_canonical_id,
      'cost_center_code',v_row.operational_code,
      'canonical_asset_id',v_asset.id
    ));
  end loop;

  return jsonb_build_object(
    'applied',v_applied,
    'skipped',v_skipped,
    'conflicts',v_conflicts,
    'canonical_mutated',v_applied>0,
    'laudus_mutated',false,
    'results',v_results
  );
end;
$function$;

revoke all on function public.motil_apply_approved_laudus_cost_centers(uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.motil_apply_approved_laudus_cost_centers(uuid,uuid,integer)
  to service_role;

comment on function public.motil_apply_approved_laudus_cost_centers(uuid,uuid,integer)
is 'Applies only human-approved Laudus cost-center proposals with exact asset plate evidence. Never writes to Laudus and never overwrites an existing canonical cost-center code.';
