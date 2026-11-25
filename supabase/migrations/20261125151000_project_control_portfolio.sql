-- Read-only consolidated project portfolio; actor and organization verified in SQL.
create function public.project_control_portfolio_v1(p_organization_id uuid,p_actor_id uuid,p_year integer default 2027)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor_area text;
begin
 select case
 when c.name='JEFE INGENIERIA Y PROYECTOS' and exists(select 1 from public.role_matrix m where m.cargo_id=c.id and m.module_key='prod_topografia' and m.access_level in ('ED','LEC')) then 'engineering'
 when c.name='Responsable de Legal' and exists(select 1 from public.role_matrix m where m.cargo_id=c.id and m.module_key='legal_contratos' and m.access_level in ('ED','LEC')) then 'legal'
 when c.name='Gerente de Finanzas' and exists(select 1 from public.role_matrix m where m.cargo_id=c.id and m.module_key='fin_finanzas' and m.access_level in ('ED','LEC')) then 'finance'
 end into actor_area
 from public.profiles p join public.cargos c on c.id=p.cargo_id
 where p.id=p_actor_id and p.organization_id=p_organization_id and p.status='active';
 if actor_area is null then raise exception 'Access denied' using errcode='42501'; end if;
 if p_year is null or p_year not between 2027 and 2100 then raise exception 'Invalid fiscal year' using errcode='22023'; end if;
 return (
 with active_budget as (
 select id,version from public.project_control_budget_versions where organization_id=p_organization_id and fiscal_year=p_year and status='approved'
 ), centers as (
 select l.id,l.cost_center_id,c.name,l.annual_amount_clp,
 (select sum(a.allocated_clp) from public.project_control_allocations a where a.organization_id=p_organization_id and a.budget_line_id=l.id) allocated
 from public.project_control_budget_lines l join active_budget v on v.id=l.budget_version_id
 join canonical.cost_centers c on c.id=l.cost_center_id and c.organization_id=l.organization_id
 where l.organization_id=p_organization_id
 ), projects as (
 select p.id,p.project_name,p.requesting_area,p.status,p.target_date,
 (select sum(a.allocated_clp)::text from public.project_control_allocations a join centers l on l.id=a.budget_line_id where a.organization_id=p_organization_id and a.project_id=p.id) allocated_clp,
 (select count(*) from public.project_control_contract_links c where c.organization_id=p_organization_id and c.project_id=p.id) contract_count,
 (select g.physical_progress_pct from public.project_control_progress g where g.organization_id=p_organization_id and g.project_id=p.id and g.observed_on<=current_date order by g.observed_on desc,g.recorded_at desc,g.id desc limit 1) physical_progress_pct
 from public.engineering_project_intake_v1 p where p.organization_id=p_organization_id
 )
 select jsonb_build_object('area',actor_area,'year',p_year,'budget_version',(select version from active_budget),
 'centers',coalesce((select jsonb_agg(jsonb_build_object('id',cost_center_id,'name',name,'budget_clp',annual_amount_clp::text,'allocated_clp',coalesce(allocated,0)::text,'unallocated_clp',(annual_amount_clp-coalesce(allocated,0))::text) order by name,cost_center_id) from centers),'[]'::jsonb),
 'projects',coalesce((select jsonb_agg(to_jsonb(p) order by p.project_name,p.id) from (select * from projects order by project_name,id limit 100) p),'[]'::jsonb),
 'project_total',(select count(*) from projects),
 'accounting_connected',false,'commitments_connected',false)
 );
end $$;
revoke all on function public.project_control_portfolio_v1(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.project_control_portfolio_v1(uuid,uuid,integer) to service_role;
