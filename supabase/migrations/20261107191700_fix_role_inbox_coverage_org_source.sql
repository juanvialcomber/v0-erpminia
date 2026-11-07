-- Ensure role inbox coverage exists for organizations with active profiles,
-- even when legacy operational_tasks_by_cargo_v4 has no rows.
-- Coverage remains a summary/optimization source, never task authority.

create or replace view public.operational_role_inbox_coverage_v1
with (security_invoker = true) as
with operational_cargos as (
  select c.id, c.name
  from public.cargos c
  where upper(c.name) = any (array[
    'JEFE PLANTA',
    'JEFES DE TURNO PLANTA',
    'JEFE MINA DON JAIME',
    'JEFE MINA PEUMO',
    'JEFE MINA SAN PEDRO',
    'JEFE BODEGA',
    'JEFE GEÓLOGIA',
    'JEFE GEOLOGÍA EXPLO.',
    'JEFE SONDAJE',
    'JEFE DE EQUIPOS MÓVILES Y ESTACIONARIOS',
    'JEFE DEPARTAMENTO DE MANTENIMIENTO',
    'JEFE DE PLANIFICACIÓN',
    'JEFE SOSTENIBILIDAD',
    'PREVENCIONISTA',
    'GERENTE',
    'PRESIDENTE',
    'GERENTE DE FINANZAS'
  ])
),
orgs as (
  select distinct p.organization_id
  from public.profiles p
  where p.organization_id is not null
),
summary as (
  select
    t.organization_id,
    t.cargo_id,
    count(*) filter (where t.responsibility = 'owner')::bigint as owned_tasks,
    count(*) filter (where t.responsibility = 'owner' and t.severity = 'critical')::bigint as owned_critical,
    count(*) filter (where t.responsibility = 'owner' and t.severity = 'warning')::bigint as owned_warning,
    count(*) filter (where t.responsibility = 'support')::bigint as support_items,
    count(*) filter (where t.responsibility = 'escalation')::bigint as escalations,
    coalesce(max(t.effective_priority), 0) as max_priority
  from public.role_tasks_actionable_v1 t
  group by t.organization_id, t.cargo_id
)
select
  o.organization_id,
  c.id as cargo_id,
  c.name as cargo_name,
  coalesce(s.owned_tasks, 0::bigint) as owned_tasks,
  coalesce(s.owned_critical, 0::bigint) as owned_critical,
  coalesce(s.owned_warning, 0::bigint) as owned_warning,
  coalesce(s.support_items, 0::bigint) as support_items,
  coalesce(s.escalations, 0::bigint) as escalations,
  coalesce(s.max_priority, 0) as max_priority
from orgs o
cross join operational_cargos c
left join summary s
  on s.organization_id = o.organization_id
 and s.cargo_id = c.id;

revoke all on public.operational_role_inbox_coverage_v1 from public, anon, authenticated;
grant select on public.operational_role_inbox_coverage_v1 to service_role;
