-- Explicit, private tolerance policy for inventory reconciliation.
-- No stock is modified by this migration.

create table if not exists integration.inventory_reconciliation_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  canonical_product_id uuid not null,
  warehouse_code text not null,
  unit text not null,
  absolute_tolerance numeric not null default 0 check (absolute_tolerance >= 0),
  reason text not null,
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists integration_inventory_reconciliation_policy_active_uq
  on integration.inventory_reconciliation_policies(
    organization_id,
    canonical_product_id,
    warehouse_code,
    unit
  )
  where active;

revoke all on integration.inventory_reconciliation_policies from public, anon, authenticated;
grant select, insert, update, delete on integration.inventory_reconciliation_policies to service_role;

comment on table integration.inventory_reconciliation_policies is
  'Explicitly approved product+warehouse stock tolerance policies. Default tolerance is zero when no active policy exists. These policies never authorize automatic stock mutation.';
