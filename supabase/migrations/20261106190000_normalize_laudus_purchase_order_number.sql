-- Normalize Laudus purchase-order visible number from the already stored external id.
-- This only touches MOTIL integration staging. It does not write to Laudus or canonical procurement truth.

update integration.laudus_purchase_orders
set order_number = external_id
where order_number is null
  and external_id is not null
  and external_id ~ '^[0-9]+$';

comment on column integration.laudus_purchase_orders.order_number is
'Visible Laudus purchase-order number. For current Laudus v2 intake this is the numeric purchaseOrderId/external_id.';
