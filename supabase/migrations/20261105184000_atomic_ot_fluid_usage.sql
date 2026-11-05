-- Record fluid use, optional recovered waste, and both audit events atomically.
create or replace function public.record_work_order_fluid_usage_v1(
  p_organization_id uuid,
  p_work_order_id uuid,
  p_canonical_asset_id uuid,
  p_canonical_product_id uuid,
  p_fluid_name text,
  p_quantity_liters numeric,
  p_inventory_units_used numeric,
  p_inventory_unit text,
  p_unit_cost_snapshot numeric,
  p_total_cost numeric,
  p_cost_state text,
  p_warehouse_code text,
  p_notes text,
  p_actor_id uuid,
  p_actor_name text,
  p_recovered_waste_liters numeric default null,
  p_waste_code text default null,
  p_waste_name text default null,
  p_waste_storage_location text default null,
  p_waste_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fluid public.maintenance_fluid_usage_records%rowtype;
  v_waste public.maintenance_waste_records%rowtype;
  v_now timestamptz := now();
begin
  if p_quantity_liters is null or p_quantity_liters <= 0 then
    raise exception 'Los litros usados deben ser mayores que cero.' using errcode='22023';
  end if;
  if nullif(trim(coalesce(p_fluid_name,'')), '') is null then
    raise exception 'Indica el fluido utilizado.' using errcode='22023';
  end if;

  perform 1
    from public.maintenance_work_orders
   where organization_id=p_organization_id
     and id=p_work_order_id
     and created_by is not null
     and lower(coalesce(status,'')) not in ('completed','closed','cancelled','canceled')
   for update;
  if not found then
    raise exception 'La OT no está disponible para registrar fluidos.' using errcode='55000';
  end if;

  insert into public.maintenance_fluid_usage_records (
    organization_id,work_order_id,canonical_asset_id,canonical_product_id,
    fluid_name,quantity_liters,inventory_units_used,inventory_unit,
    unit_cost_snapshot,total_cost,cost_state,source_type,warehouse_code,
    validation_status,notes,created_by,used_at,created_at,updated_at
  ) values (
    p_organization_id,p_work_order_id,p_canonical_asset_id,p_canonical_product_id,
    trim(p_fluid_name),p_quantity_liters,
    case when p_inventory_units_used is not null and p_inventory_units_used > 0 then p_inventory_units_used else null end,
    nullif(trim(coalesce(p_inventory_unit,'')),''),
    p_unit_cost_snapshot,p_total_cost,coalesce(nullif(trim(coalesce(p_cost_state,'')),''),'unavailable'),
    'manual',nullif(trim(coalesce(p_warehouse_code,'')),''),
    'reported',nullif(trim(coalesce(p_notes,'')),''),
    p_actor_id,v_now,v_now,v_now
  ) returning * into v_fluid;

  if p_recovered_waste_liters is not null then
    if p_recovered_waste_liters <= 0 then
      raise exception 'Los litros de residuo recuperado deben ser mayores que cero.' using errcode='22023';
    end if;
    if nullif(trim(coalesce(p_waste_code,'')),'') is null or nullif(trim(coalesce(p_waste_name,'')),'') is null then
      raise exception 'Falta clasificar el residuo recuperado.' using errcode='22023';
    end if;

    insert into public.maintenance_waste_records (
      organization_id,work_order_id,canonical_asset_id,waste_code,waste_name,
      classification,quantity,unit,storage_location,notes,status,
      created_by,updated_by,generated_at,created_at,updated_at
    ) values (
      p_organization_id,p_work_order_id,p_canonical_asset_id,trim(p_waste_code),trim(p_waste_name),
      'to_classify',p_recovered_waste_liters,'L',
      nullif(trim(coalesce(p_waste_storage_location,'')),''),
      nullif(trim(coalesce(p_waste_notes,'')),''),
      'generated',p_actor_id,p_actor_id,v_now,v_now,v_now
    ) returning * into v_waste;

    insert into public.work_order_events (
      organization_id,work_order_id,canonical_asset_id,event_type,event_at,
      actor_id,actor_name,source_table,source_record_id,summary,payload
    ) values (
      p_organization_id,p_work_order_id,p_canonical_asset_id,'waste_generated',v_now,
      p_actor_id,nullif(trim(coalesce(p_actor_name,'')),''),
      'maintenance_waste_records',v_waste.id::text,
      'Residuo líquido vinculado al uso de fluido',
      jsonb_build_object(
        'source_fluid_usage_id',v_fluid.id,
        'waste_code',p_waste_code,
        'quantity',p_recovered_waste_liters,
        'unit','L'
      )
    );
  end if;

  insert into public.work_order_events (
    organization_id,work_order_id,canonical_asset_id,event_type,event_at,
    actor_id,actor_name,source_table,source_record_id,summary,payload
  ) values (
    p_organization_id,p_work_order_id,p_canonical_asset_id,'fluid_usage_reported',v_now,
    p_actor_id,nullif(trim(coalesce(p_actor_name,'')),''),
    'maintenance_fluid_usage_records',v_fluid.id::text,
    'Uso de fluido registrado',
    jsonb_build_object(
      'fluid_name',p_fluid_name,
      'quantity_liters',p_quantity_liters,
      'cost_state',p_cost_state
    )
  );

  return jsonb_build_object(
    'fluid',to_jsonb(v_fluid),
    'waste',case when v_waste.id is null then null else to_jsonb(v_waste) end,
    'linked_waste_created',v_waste.id is not null,
    'inventory_mutated',false
  );
end;
$function$;

revoke all on function public.record_work_order_fluid_usage_v1(
  uuid,uuid,uuid,uuid,text,numeric,numeric,text,numeric,numeric,text,text,text,uuid,text,numeric,text,text,text,text
) from public;
revoke all on function public.record_work_order_fluid_usage_v1(
  uuid,uuid,uuid,uuid,text,numeric,numeric,text,numeric,numeric,text,text,text,uuid,text,numeric,text,text,text,text
) from authenticated;
grant execute on function public.record_work_order_fluid_usage_v1(
  uuid,uuid,uuid,uuid,text,numeric,numeric,text,numeric,numeric,text,text,text,uuid,text,numeric,text,text,text,text
) to service_role;
