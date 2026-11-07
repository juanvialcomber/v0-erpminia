-- Monthly compliance period for contractor startup folders.
-- Additive only: historical folders remain unchanged with NULL period.
alter table public.carpetas_arranque
  add column if not exists compliance_period date;

comment on column public.carpetas_arranque.compliance_period is
  'First day of the compliance month (YYYY-MM-01). NULL means legacy folder without explicit monthly period.';

create unique index if not exists carpetas_arranque_rut_period_unique
  on public.carpetas_arranque (
    (regexp_replace(upper(coalesce(empresa_rut,'')), '[^0-9K]', '', 'g')),
    compliance_period
  )
  where compliance_period is not null and empresa_rut is not null;
