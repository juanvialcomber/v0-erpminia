-- Normalize Laudus purchase-order visible number from the already stored external id.
-- This only touches MOTIL integration staging. It does not write to Laudus or canonical procurement truth.

create or replace function integration.normalize_laudus_purchase_order_number()
returns trigger
language plpgsql
set search_path = 'integration','pg_temp'
as $$
begin
  if new.order_number is null
     and new.external_id is not null
     and new.external_id ~ '^[0-9]+$' then
    new.order_number := new.external_id;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_laudus_purchase_order_number
  on integration.laudus_purchase_orders;

create trigger normalize_laudus_purchase_order_number
before insert or update of external_id, order_number
on integration.laudus_purchase_orders
for each row
execute function integration.normalize_laudus_purchase_order_number();

update integration.laudus_purchase_orders
set order_number = external_id
where order_number is null
  and external_id is not null
  and external_id ~ '^[0-9]+$';

comment on column integration.laudus_purchase_orders.order_number is
'Visible Laudus purchase-order number. For current Laudus v2 intake this is the numeric purchaseOrderId/external_id.';
