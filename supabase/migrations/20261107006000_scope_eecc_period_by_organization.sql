-- Scope monthly contractor-folder uniqueness by organization.
-- Prepared for release; do not apply separately from the verified Legal release gate.
drop index if exists public.carpetas_arranque_rut_period_unique;

create unique index carpetas_arranque_rut_period_unique
  on public.carpetas_arranque (
    organization_id,
    (regexp_replace(upper(coalesce(empresa_rut,'')), '[^0-9K]', '', 'g')),
    compliance_period
  )
  where compliance_period is not null and empresa_rut is not null;
