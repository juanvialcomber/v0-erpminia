-- Human-gated promotion of deterministic historical purchase-order reconciliation.
-- Fills only missing canonical supplier / cost center values and revalidates every row.
-- Never writes to Laudus and never overwrites existing canonical values.

create or replace function public.motil_apply_resolvable_purchase_order_reconciliation(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = 'public','integration','canonical','pg_temp'
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,25),100));
  v_row record;
  v_current canonical.purchase_orders%rowtype;
  v_applied integer := 0;
  v_skipped integer := 0;
  v_conflicts integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if p_organization_id is null or p_actor_user_id is null then
    raise exception 'organization and actor are required';
  end if;

  for v_row in
    select *
    from integration.purchase_order_reconciliation_preview_v1 p
    where p.organization_id=p_organization_id
      and p.fully_resolvable
      and (
        p.canonical_supplier_id is null
        or nullif(trim(p.cost_center_code),'') is null
      )
    order by p.order_date desc nulls last,p.order_number,p.purchase_order_id
    limit v_limit
  loop
    select *
      into v_current
    from canonical.purchase_orders po
    where po.organization_id=p_organization_id
      and po.id=v_row.purchase_order_id
    for update;

    if not found then
      v_conflicts := v_conflicts + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'purchase_order_id',v_row.purchase_order_id,
        'state','conflict',
        'reason','canonical_purchase_order_missing'
      ));
      continue;
    end if;

    if v_current.canonical_supplier_id is not null
       and v_current.canonical_supplier_id is distinct from v_row.proposed_supplier_id then
      v_conflicts := v_conflicts + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'purchase_order_id',v_row.purchase_order_id,
        'state','conflict',
        'reason','supplier_changed_since_preview'
      ));
      continue;
    end if;

    if nullif(trim(v_current.cost_center_code),'') is not null
       and upper(trim(v_current.cost_center_code)) is distinct from upper(trim(v_row.proposed_cost_center_code)) then
      v_conflicts := v_conflicts + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'purchase_order_id',v_row.purchase_order_id,
        'state','conflict',
        'reason','cost_center_changed_since_preview'
      ));
      continue;
    end if;

    if v_row.proposed_supplier_id is null or nullif(trim(v_row.proposed_cost_center_code),'') is null then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'purchase_order_id',v_row.purchase_order_id,
        'state','skipped',
        'reason','preview_no_longer_deterministic'
      ));
      continue;
    end if;

    update canonical.purchase_orders po
    set canonical_supplier_id=coalesce(po.canonical_supplier_id,v_row.proposed_supplier_id),
        cost_center_code=coalesce(nullif(trim(po.cost_center_code),''),v_row.proposed_cost_center_code),
        validation_notes=coalesce(po.validation_notes,'{}'::text[]) || array[
          'Conciliación histórica aplicada en MOTIL con match determinístico de proveedor y centro de costo.'
        ],
        source_payload=coalesce(po.source_payload,'{}'::jsonb) || jsonb_build_object(
          'motil_laudus_reconciliation',
          jsonb_build_object(
            'applied_at',now(),
            'actor_user_id',p_actor_user_id,
            'supplier_resolution_status',v_row.supplier_resolution_status,
            'cost_center_resolution_status',v_row.cost_center_resolution_status,
            'proposed_supplier_id',v_row.proposed_supplier_id,
            'proposed_cost_center_code',v_row.proposed_cost_center_code,
            'read_only_laudus',true
          )
        ),
        updated_at=now()
    where po.organization_id=p_organization_id
      and po.id=v_row.purchase_order_id;

    v_applied := v_applied + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'purchase_order_id',v_row.purchase_order_id,
      'order_number',v_row.order_number,
      'state','applied',
      'canonical_supplier_id',v_row.proposed_supplier_id,
      'cost_center_code',v_row.proposed_cost_center_code
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

revoke all on function public.motil_apply_resolvable_purchase_order_reconciliation(uuid,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.motil_apply_resolvable_purchase_order_reconciliation(uuid,uuid,integer)
  to service_role;

comment on function public.motil_apply_resolvable_purchase_order_reconciliation(uuid,uuid,integer)
is 'Human-gated promotion of deterministic historical purchase-order supplier and cost-center matches. Revalidates each row, fills only missing canonical fields, never overwrites existing values and never writes to Laudus.';
