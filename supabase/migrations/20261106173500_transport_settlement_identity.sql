begin;
alter table public.transport_settlements
  add column if not exists carrier_rut text;
create index if not exists idx_transport_settlements_org_rut
  on public.transport_settlements (organization_id, carrier_rut);
commit;
