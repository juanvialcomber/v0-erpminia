-- Temporary, warehouse-scoped physical count support.
-- Ariel can confirm physical counts in Central (002) during a bounded period;
-- Esteban stays the permanent head of Bodega and primary verifier.
-- No general Bodega edit rights, stock movement, or canonical stock mutation.
alter table public.bodega_stock_verifier_assignments
  add column if not exists expires_at timestamptz;

create index if not exists idx_bodega_stock_verifier_assignment_expiry
  on public.bodega_stock_verifier_assignments
  (organization_id, warehouse_id, profile_id, expires_at)
  where is_active;

-- The expiration starts on first activation, not on the source commit date.
-- Reapplying this migration does not extend an already granted access period.
insert into public.bodega_stock_verifier_assignments
  (organization_id, warehouse_id, profile_id, expires_at)
select p.organization_id, w.id, p.id, now() + interval '14 days'
from public.profiles p
join public.cargos c on c.id = p.cargo_id
join public.warehouses w
  on w.organization_id = p.organization_id
 and w.code = '002'
where p.id = '6bc039fa-ac0e-4be8-b4ee-444a13996581'::uuid
  and p.organization_id = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee'::uuid
  and p.status = 'active'
  and c.name = 'Jefe de Planificación'
on conflict (organization_id, warehouse_id, profile_id) do nothing;

comment on column public.bodega_stock_verifier_assignments.expires_at is
  'UTC expiry of scoped support access. NULL means permanent assignment. Must be checked server-side on every read/write authorization.';
