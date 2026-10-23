-- Give Gerente de Finanzas cross-module visibility needed for financial oversight.
-- Operational modules remain read-only. Finance, reporting and cost centers retain edit access.

with finance_manager as (
  select id
  from public.cargos
  where name = 'Gerente de Finanzas'
), desired_permissions(module_key, access_level) as (
  values
    ('fin_finanzas'::text, 'ED'::text),
    ('fin_reportes'::text, 'ED'::text),
    ('core_centros_costos'::text, 'ED'::text),
    ('fin_compras'::text, 'LEC'::text),
    ('bodega_inventario'::text, 'LEC'::text),
    ('bodega_documentos'::text, 'LEC'::text),
    ('mant_operaciones'::text, 'LEC'::text),
    ('mant_gerencial'::text, 'LEC'::text),
    ('mant_recursos'::text, 'LEC'::text),
    ('mant_documentos'::text, 'LEC'::text),
    ('core_alertas'::text, 'LEC'::text)
)
insert into public.role_matrix (cargo_id, module_key, access_level, updated_at)
select c.id, p.module_key, p.access_level, now()
from finance_manager c
cross join desired_permissions p
on conflict (cargo_id, module_key)
do update set
  access_level = excluded.access_level,
  updated_at = excluded.updated_at;
