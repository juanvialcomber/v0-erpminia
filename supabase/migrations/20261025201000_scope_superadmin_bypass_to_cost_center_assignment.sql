-- Limit the superadmin requester bypass to the dedicated cost-center assignment permission.
create or replace function public.approve_role_matrix_change(
  p_request_id uuid,
  p_stage text,
  p_approve boolean,
  p_reason text default null::text
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_req public.role_matrix_change_requests%rowtype;
  v_user uuid := public.current_application_user_id();
  v_cargo_name text;
  v_role text;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_req from public.role_matrix_change_requests where id=p_request_id for update;
  if not found then raise exception 'request not found'; end if;
  if not exists(select 1 from public.user_roles ur where ur.user_id=v_user and ur.organization_id=v_req.organization_id) then raise exception 'forbidden'; end if;
  select c.name,p.role into v_cargo_name,v_role from public.profiles p left join public.cargos c on c.id=p.cargo_id where p.id=v_user;

  if p_stage='area_manager' then
    if v_req.status<>'pending_area_manager' then raise exception 'request not pending area manager approval'; end if;
    if not (coalesce(v_cargo_name,'') ilike 'JEFE %' or lower(coalesce(v_role,'')) in ('superadmin','super_admin','admin')) then raise exception 'area manager approval required'; end if;
    if v_req.requested_by=v_user and lower(coalesce(v_role,'')) not in ('superadmin','super_admin') then raise exception 'requester cannot self-approve'; end if;
    if not p_approve then
      update public.role_matrix_change_requests set status='rejected',rejected_by=v_user,rejected_at=now(),rejection_reason=coalesce(nullif(trim(p_reason),''),'Rechazado'),updated_at=now() where id=p_request_id;
      return 'rejected';
    end if;
    update public.role_matrix_change_requests set area_manager_approved_by=v_user,area_manager_approved_at=now(),status='pending_management',updated_at=now() where id=p_request_id;
    return 'pending_management';

  elsif p_stage='management' then
    if v_req.status<>'pending_management' then raise exception 'request not pending management approval'; end if;
    if not (coalesce(v_cargo_name,'') in ('GERENTE','SUBGERENTE OP.') or lower(coalesce(v_role,'')) in ('superadmin','super_admin','admin')) then raise exception 'management approval required'; end if;
    if v_req.area_manager_approved_by is null then raise exception 'area manager approval required'; end if;
    if not p_approve then
      update public.role_matrix_change_requests set status='rejected',rejected_by=v_user,rejected_at=now(),rejection_reason=coalesce(nullif(trim(p_reason),''),'Rechazado'),updated_at=now() where id=p_request_id;
      return 'rejected';
    end if;

    if v_req.requested_by=v_user
      and lower(coalesce(v_role,'')) in ('superadmin','super_admin')
      and v_req.module_key='core_centros_costos_asignacion'
    then
      perform set_config('app.role_matrix_approved_change','1',true);
      if v_req.operation='delete' then
        delete from public.role_matrix where cargo_id=v_req.cargo_id and module_key=v_req.module_key;
      else
        insert into public.role_matrix(cargo_id,module_key,access_level) values(v_req.cargo_id,v_req.module_key,v_req.requested_access_level)
        on conflict(cargo_id,module_key) do update set access_level=excluded.access_level,updated_at=now();
      end if;
      update public.role_matrix_change_requests
      set management_approval_bypassed_by=v_user,management_approval_bypassed_at=now(),status='applied',applied_at=now(),updated_at=now()
      where id=p_request_id;
      return 'applied_without_management';
    end if;

    if (v_req.requested_by=v_user and lower(coalesce(v_role,'')) not in ('superadmin','super_admin'))
      or v_req.area_manager_approved_by=v_user then raise exception 'management approval must be a distinct approver'; end if;
    perform set_config('app.role_matrix_approved_change','1',true);
    if v_req.operation='delete' then
      delete from public.role_matrix where cargo_id=v_req.cargo_id and module_key=v_req.module_key;
    else
      insert into public.role_matrix(cargo_id,module_key,access_level) values(v_req.cargo_id,v_req.module_key,v_req.requested_access_level)
      on conflict(cargo_id,module_key) do update set access_level=excluded.access_level,updated_at=now();
    end if;
    update public.role_matrix_change_requests
    set management_approved_by=v_user,management_approved_at=now(),status='applied',applied_at=now(),updated_at=now()
    where id=p_request_id;
    return 'applied';
  else
    raise exception 'invalid approval stage';
  end if;
end
$function$;

create or replace function public.approve_role_matrix_change_as(
  p_actor_id uuid,
  p_request_id uuid,
  p_stage text,
  p_approve boolean,
  p_reason text default null::text
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_req public.role_matrix_change_requests%rowtype;
  v_cargo_name text;
  v_role text;
begin
  select * into v_req from public.role_matrix_change_requests where id=p_request_id for update;
  if not found then raise exception 'request not found'; end if;
  if not exists(select 1 from public.user_roles ur where ur.user_id=p_actor_id and ur.organization_id=v_req.organization_id) then raise exception 'forbidden'; end if;
  select c.name,p.role into v_cargo_name,v_role from public.profiles p left join public.cargos c on c.id=p.cargo_id where p.id=p_actor_id;

  if p_stage='area_manager' then
    if v_req.status<>'pending_area_manager' then raise exception 'request not pending area manager approval'; end if;
    if not (coalesce(v_cargo_name,'') ilike 'JEFE %' or lower(coalesce(v_role,'')) in ('superadmin','super_admin','admin')) then raise exception 'area manager approval required'; end if;
    if v_req.requested_by=p_actor_id and lower(coalesce(v_role,'')) not in ('superadmin','super_admin') then raise exception 'requester cannot self-approve'; end if;
    if not p_approve then
      update public.role_matrix_change_requests set status='rejected',rejected_by=p_actor_id,rejected_at=now(),rejection_reason=coalesce(nullif(trim(p_reason),''),'Rechazado'),updated_at=now() where id=p_request_id;
      return 'rejected';
    end if;
    update public.role_matrix_change_requests set area_manager_approved_by=p_actor_id,area_manager_approved_at=now(),status='pending_management',updated_at=now() where id=p_request_id;
    return 'pending_management';

  elsif p_stage='management' then
    if v_req.status<>'pending_management' then raise exception 'request not pending management approval'; end if;
    if not (coalesce(v_cargo_name,'') in ('GERENTE','SUBGERENTE OP.') or lower(coalesce(v_role,'')) in ('superadmin','super_admin','admin')) then raise exception 'management approval required'; end if;
    if v_req.area_manager_approved_by is null then raise exception 'area manager approval required'; end if;
    if not p_approve then
      update public.role_matrix_change_requests set status='rejected',rejected_by=p_actor_id,rejected_at=now(),rejection_reason=coalesce(nullif(trim(p_reason),''),'Rechazado'),updated_at=now() where id=p_request_id;
      return 'rejected';
    end if;

    if v_req.requested_by=p_actor_id
      and lower(coalesce(v_role,'')) in ('superadmin','super_admin')
      and v_req.module_key='core_centros_costos_asignacion'
    then
      perform set_config('app.role_matrix_approved_change','1',true);
      if v_req.operation='delete' then
        delete from public.role_matrix where cargo_id=v_req.cargo_id and module_key=v_req.module_key;
      else
        insert into public.role_matrix(cargo_id,module_key,access_level) values(v_req.cargo_id,v_req.module_key,v_req.requested_access_level)
        on conflict(cargo_id,module_key) do update set access_level=excluded.access_level,updated_at=now();
      end if;
      update public.role_matrix_change_requests
      set management_approval_bypassed_by=p_actor_id,management_approval_bypassed_at=now(),status='applied',applied_at=now(),updated_at=now()
      where id=p_request_id;
      return 'applied_without_management';
    end if;

    if (v_req.requested_by=p_actor_id and lower(coalesce(v_role,'')) not in ('superadmin','super_admin'))
      or v_req.area_manager_approved_by=p_actor_id then raise exception 'management approval must be a distinct approver'; end if;
    perform set_config('app.role_matrix_approved_change','1',true);
    if v_req.operation='delete' then
      delete from public.role_matrix where cargo_id=v_req.cargo_id and module_key=v_req.module_key;
    else
      insert into public.role_matrix(cargo_id,module_key,access_level) values(v_req.cargo_id,v_req.module_key,v_req.requested_access_level)
      on conflict(cargo_id,module_key) do update set access_level=excluded.access_level,updated_at=now();
    end if;
    update public.role_matrix_change_requests
    set management_approved_by=p_actor_id,management_approved_at=now(),status='applied',applied_at=now(),updated_at=now()
    where id=p_request_id;
    return 'applied';
  else
    raise exception 'invalid approval stage';
  end if;
end
$function$;
