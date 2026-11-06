begin;

alter table public.contracts
  alter column contractor_id drop not null;

alter table public.contracts
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

create index if not exists idx_contracts_org_supplier
  on public.contracts (organization_id, supplier_id);

alter table public.contracts
  drop constraint if exists contracts_party_present_check;

alter table public.contracts
  add constraint contracts_party_present_check
  check (
    contractor_id is not null
    or supplier_id is not null
    or nullif(btrim(contractor_name), '') is not null
  );

commit;
