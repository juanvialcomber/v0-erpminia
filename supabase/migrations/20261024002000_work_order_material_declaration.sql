-- Explicit material intent for modern work orders.
alter table public.maintenance_work_orders
  add column if not exists materials_required boolean,
  add column if not exists materials_reviewed_at timestamptz,
  add column if not exists materials_reviewed_by uuid;

comment on column public.maintenance_work_orders.materials_required is
  'Explicit material intent. NULL=not reviewed, false=no materials, true=materials required.';
comment on column public.maintenance_work_orders.materials_reviewed_at is
  'Timestamp when material intent was explicitly reviewed.';
comment on column public.maintenance_work_orders.materials_reviewed_by is
  'Application profile that reviewed material intent.';

create or replace function public.declare_work_order_materials_v1(
  p_organization_id uuid,
  p_work_order_id uuid,
  p_requires_materials boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.current_application_user_id();
  v_wo public.maintenance_work_orders%rowtype;
  v_active_requirements integer := 0;
  v_review_status text;
begin
  if v_actor is null then raise exception 'Usuario autenticado requerido'; end if;

  select * into v_wo
  from public.maintenance_work_orders
  where organization_id=p_organization_id and id=p_work_order_id
  for update;
  if not found then raise exception 'OT no encontrada en la organización'; end if;
  if v_wo.created_by is null then raise exception 'La OT histórica es de solo lectura'; end if;

  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id=v_actor and ur.organization_id=p_organization_id
  ) then raise exception 'Sin acceso a la organización'; end if;

  select status into v_review_status
  from public.work_order_supervisor_reviews
  where organization_id=p_organization_id and work_order_id=p_work_order_id;
  if v_review_status='approved' then
    raise exception 'La OT aprobada no puede cambiar su declaración de materiales';
  end if;

  select count(*) into v_active_requirements
  from public.work_order_material_requirements
  where organization_id=p_organization_id
    and work_order_id=p_work_order_id
    and status <> 'cancelled';

  if p_requires_materials is false and v_active_requirements > 0 then
    raise exception 'La OT tiene materiales declarados; elimina o cancela los requerimientos antes de marcar Sin materiales';
  end if;

  update public.maintenance_work_orders
  set materials_required=p_requires_materials,
      materials_reviewed_at=now(),
      materials_reviewed_by=v_actor,
      updated_at=now()
  where organization_id=p_organization_id and id=p_work_order_id;

  insert into public.work_order_events(
    organization_id,work_order_id,canonical_asset_id,event_type,event_at,
    actor_id,source_table,source_record_id,summary,payload
  ) values (
    p_organization_id,p_work_order_id,v_wo.canonical_asset_id,'materials_requirement_declared',now(),
    v_actor,'maintenance_work_orders',p_work_order_id::text,
    case when p_requires_materials then 'OT declarada con uso de materiales' else 'OT declarada sin uso de materiales' end,
    jsonb_build_object('materials_required',p_requires_materials,'active_requirements',v_active_requirements)
  );

  return jsonb_build_object(
    'work_order_id',p_work_order_id,
    'materials_required',p_requires_materials,
    'materials_reviewed_at',now(),
    'active_requirements',v_active_requirements
  );
end;
$$;

revoke execute on function public.declare_work_order_materials_v1(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.declare_work_order_materials_v1(uuid,uuid,boolean) to service_role;
