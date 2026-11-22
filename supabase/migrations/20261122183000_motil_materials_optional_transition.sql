begin;

-- Modo de transición antes de habilitar la nueva Bodega.
-- Aprobar la ejecución NO significa declarar todos los materiales requeridos
-- como instalados. La confirmación física permanece voluntaria y explícita.
-- El cambio no toca saldos, movimientos, existencias ni instalaciones históricas.
create or replace function public.approve_work_order_with_material_confirmation_v1(
  p_organization_id uuid,
  p_work_order_id uuid,
  p_reviewer_profile_id uuid,
  p_confirm_materials_installed boolean default false,
  p_decision_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_wo public.maintenance_work_orders%rowtype;
  v_reviewer public.people%rowtype;
  v_review public.work_order_supervisor_reviews%rowtype;
  v_requirement record;
  v_installed_from_warehouse numeric;
  v_to_confirm numeric;
  v_active_requirements integer := 0;
  v_confirmed_lines integer := 0;
  v_now timestamptz := now();
begin
  -- Solo se expone a service_role; igualmente se verifica persona, cargo, tenant y OT.
  select * into v_reviewer
  from public.people pe
  where pe.organization_id = p_organization_id
    and pe.profile_id = p_reviewer_profile_id
    and pe.employment_status = 'active'
    and pe.full_name in ('Ariel López', 'Mauricio Astudillo')
  limit 1;
  if not found then
    raise exception 'Solo Ariel López o Mauricio Astudillo pueden aprobar la OT'
      using errcode = '42501';
  end if;

  select * into v_wo
  from public.maintenance_work_orders
  where organization_id = p_organization_id and id = p_work_order_id
  for update;
  if not found then
    raise exception 'La OT no existe en esta organización' using errcode = 'P0002';
  end if;
  if v_wo.created_by is null then
    raise exception 'La OT histórica es de solo lectura' using errcode = '55000';
  end if;
  if v_wo.status <> 'completed' then
    raise exception 'La OT debe estar terminada antes de ser aprobada' using errcode = '55000';
  end if;

  select * into v_review from public.work_order_supervisor_reviews
  where organization_id = p_organization_id and work_order_id = p_work_order_id
  for update;
  if found and v_review.status = 'approved' then
    return v_review.id; -- Reintentos no duplican instalaciones ni eventos.
  end if;

  select count(*) into v_active_requirements
  from public.work_order_material_requirements
  where organization_id = p_organization_id
    and work_order_id = p_work_order_id
    and status <> 'cancelled';

  -- En etapa de transición el supervisor aprueba la ejecución aunque la
  -- conciliación física de Bodega continúe pendiente. Nunca interpreta un
  -- requerimiento planificado como instalación real.

  insert into public.work_order_supervisor_reviews (
    organization_id, work_order_id, status, decision_note,
    reviewed_by_profile_id, reviewed_by_person_id, reviewed_by_name, reviewed_at, updated_at
  ) values (
    p_organization_id, p_work_order_id, 'approved', nullif(trim(p_decision_note), ''),
    p_reviewer_profile_id, v_reviewer.id, v_reviewer.full_name, v_now, v_now
  )
  on conflict (organization_id, work_order_id) do update set
    status = 'approved',
    decision_note = excluded.decision_note,
    reviewed_by_profile_id = excluded.reviewed_by_profile_id,
    reviewed_by_person_id = excluded.reviewed_by_person_id,
    reviewed_by_name = excluded.reviewed_by_name,
    reviewed_at = excluded.reviewed_at,
    updated_at = excluded.updated_at
  returning * into v_review;

  if coalesce(p_confirm_materials_installed, false) then
  for v_requirement in
    select req.id, req.canonical_product_id, req.quantity_required
    from public.work_order_material_requirements req
    where req.organization_id = p_organization_id
      and req.work_order_id = p_work_order_id
      and req.status <> 'cancelled'
    order by req.id
  loop
    -- Entrega fisica ya registrada no debe contarse dos veces.
    select coalesce(sum(p.quantity_installed), 0)
    into v_installed_from_warehouse
    from public.work_order_parts p
    where p.organization_id = p_organization_id
      and p.work_order_id = p_work_order_id
      and p.canonical_product_id = v_requirement.canonical_product_id;
    v_to_confirm := greatest(v_requirement.quantity_required - v_installed_from_warehouse, 0);
    if v_to_confirm > 0 then
      insert into public.work_order_material_approval_installations (
        organization_id, work_order_id, requirement_id, canonical_product_id,
        installed_quantity, supervisor_review_id,
        confirmed_by_profile_id, confirmed_by_person_id, confirmed_by_name, confirmed_at
      ) values (
        p_organization_id, p_work_order_id, v_requirement.id, v_requirement.canonical_product_id,
        v_to_confirm, v_review.id,
        p_reviewer_profile_id, v_reviewer.id, v_reviewer.full_name, v_now
      )
      on conflict (organization_id, work_order_id, requirement_id) do nothing;
      v_confirmed_lines := v_confirmed_lines + 1;
    end if;
  end loop;
  end if;

  insert into public.work_order_events (
    organization_id, work_order_id, canonical_asset_id, event_type, event_at,
    actor_id, actor_name, source_table, source_record_id, summary, payload
  ) values (
    p_organization_id, p_work_order_id, v_wo.canonical_asset_id,
    'supervisor_approved', v_now, p_reviewer_profile_id, v_reviewer.full_name,
    'public.work_order_supervisor_reviews', v_review.id::text,
    case when coalesce(p_confirm_materials_installed, false)
      then 'OT aprobada por supervisión; instalaciones confirmadas sin conciliar bodega'
      else 'OT aprobada por supervisión; materiales aún sin confirmación de instalación'
    end,
    jsonb_build_object(
      'status', 'approved',
      'note', nullif(trim(p_decision_note), ''),
      'installation_confirmation_lines', v_confirmed_lines,
      'materials_installation_confirmed', coalesce(p_confirm_materials_installed, false),
      'material_reconciliation_deferred', true,
      'inventory_reconciled', false,
      'confirmation_source', case when coalesce(p_confirm_materials_installed, false) then 'supervisor_approval' else null end
    )
  );
  return v_review.id;
end;
$function$;

revoke all on function public.approve_work_order_with_material_confirmation_v1(uuid,uuid,uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function public.approve_work_order_with_material_confirmation_v1(uuid,uuid,uuid,boolean,text)
  to service_role;


-- Feature probe: the application fails closed (legacy mandatory confirmation)
-- until this function is installed in the same transaction as the new RPC.
create or replace function public.motil_ot_materials_transition_ready_v1()
returns boolean
language sql stable
security invoker
set search_path to 'public'
as $
  select true;
$;
revoke all on function public.motil_ot_materials_transition_ready_v1()
  from public, anon, authenticated;
grant execute on function public.motil_ot_materials_transition_ready_v1()
  to service_role;

commit;
