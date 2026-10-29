-- Resolve deterministic Laudus warehouse mapping for 002 · Bodega Central.
-- Bounded and reversible: only promotes the exact new_candidate row when the canonical warehouse
-- with the same organization, code and name exists exactly once.

do $$
declare
  v_org uuid := '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';
  v_warehouse_id uuid;
  v_count integer;
begin
  select count(*), min(id)
    into v_count, v_warehouse_id
  from public.warehouses
  where organization_id=v_org
    and code='002'
    and name='Bodega Central'
    and status='active';

  if v_count <> 1 then
    raise exception 'Expected exactly one active canonical warehouse 002 · Bodega Central, found %', v_count;
  end if;

  update integration.laudus_warehouses
  set motil_warehouse_id=v_warehouse_id,
      reconciliation_status='matched',
      synced_at=now()
  where organization_id=v_org
    and external_id='002'
    and name='Bodega Central'
    and reconciliation_status='new_candidate'
    and motil_warehouse_id is null;

  if not found then
    raise exception 'Laudus warehouse 002 is no longer an unmapped new_candidate; aborting bounded promotion';
  end if;
end
$$;
