-- Persist Laudus inconsistencies as evidence in the existing reconciliation review ledger.
-- Source records remain in the Laudus service views; this ledger stores deterministic review pointers.

insert into public.data_reconciliation_reviews
  (organization_id, issue_key, entity_type, entity_id, issue_type, field_name, status, evidence_reference, updated_at)
select organization_id,
  'laudus:inventory_mismatch:' || coalesce(sku, product_external_id),
  'inventory', canonical_product_id, 'quantity_mismatch', 'stock_quantity', 'open',
  concat('laudus_inventory_reconciliation_service_v1:',coalesce(sku,product_external_id),
         ' | laudus=',coalesce(laudus_stock::text,'null'),
         ' | motil=',coalesce(motil_stock::text,'null'),
         ' | delta=',coalesce(quantity_delta::text,'null'),
         ' | laudus_sync=',coalesce(laudus_synced_at::text,'null'),
         ' | motil_update=',coalesce(motil_updated_at::text,'null')),
  now()
from public.laudus_inventory_reconciliation_service_v1
where reconciliation_state='quantity_mismatch'
  and greatest(coalesce(laudus_synced_at,'epoch'::timestamptz),
               coalesce(motil_updated_at::timestamptz,'epoch'::timestamptz)) >= now()-interval '90 days'
on conflict (organization_id,issue_key) do update
set entity_id=excluded.entity_id,evidence_reference=excluded.evidence_reference,updated_at=now(),
    status=case when data_reconciliation_reviews.status='ignored' then 'ignored' else 'open' end;

insert into public.data_reconciliation_reviews
  (organization_id, issue_key, entity_type, entity_id, issue_type, field_name, status, evidence_reference, updated_at)
select organization_id,
  'laudus:negative_stock:' || coalesce(sku, product_external_id) || ':' || warehouse_external_id,
  'inventory', canonical_product_id, 'negative_stock', 'stock_quantity', 'open',
  concat('laudus_negative_stock_positions_service_v1:',coalesce(sku,product_external_id),
         ' | warehouse=',coalesce(warehouse_name,warehouse_external_id),
         ' | warehouse_stock=',warehouse_stock::text,
         ' | total_laudus_stock=',total_laudus_stock::text,
         ' | sync=',coalesce(synced_at::text,'null')),
  now()
from public.laudus_negative_stock_positions_service_v1
where synced_at >= now()-interval '90 days'
on conflict (organization_id,issue_key) do update
set entity_id=excluded.entity_id,evidence_reference=excluded.evidence_reference,updated_at=now(),
    status=case when data_reconciliation_reviews.status='ignored' then 'ignored' else 'open' end;

insert into public.data_reconciliation_reviews
  (organization_id, issue_key, entity_type, entity_id, issue_type, field_name, status, evidence_reference, updated_at)
select organization_id,'laudus:ap_due_before_issue:'||external_id,'invoice',null,
  'invalid_source_date_order','due_date','open',
  concat('laudus_accounts_payable_service_v1:',external_id,
         ' | document=',coalesce(document_number,''),
         ' | issued=',coalesce(issued_date::text,'null'),
         ' | due=',coalesce(due_date::text,'null'),
         ' | original=',coalesce(original_amount::text,'null'),
         ' | outstanding=',coalesce(outstanding_amount::text,'null'),
         ' | sync=',coalesce(synced_at::text,'null')),
  now()
from public.laudus_accounts_payable_service_v1
where coalesce(issued_date,source_updated_at,observed_at)>=now()-interval '90 days'
  and due_date<issued_date
on conflict (organization_id,issue_key) do update
set evidence_reference=excluded.evidence_reference,updated_at=now(),
    status=case when data_reconciliation_reviews.status='ignored' then 'ignored' else 'open' end;

insert into public.data_reconciliation_reviews
  (organization_id, issue_key, entity_type, entity_id, issue_type, field_name, status, evidence_reference, updated_at)
select organization_id,'laudus:purchase_order_unresolved:'||purchase_order_id::text,'purchase_order',purchase_order_id,
  case when supplier_resolution_status<>'already_linked' then 'supplier_unresolved' else 'cost_center_unresolved' end,
  case when supplier_resolution_status<>'already_linked' then 'supplier' else 'cost_center' end,
  'open',
  concat('purchase_order_reconciliation_preview_service_v1:',purchase_order_id::text,
         ' | order=',coalesce(order_number,''),
         ' | date=',coalesce(order_date::text,'null'),
         ' | supplier=',coalesce(supplier_name,''),
         ' | supplier_status=',coalesce(supplier_resolution_status,''),
         ' | cost_center_status=',coalesce(cost_center_resolution_status,''),
         ' | total=',coalesce(total_amount::text,'null'),' ',coalesce(currency,'')),
  now()
from public.purchase_order_reconciliation_preview_service_v1
where order_date>=current_date-90 and fully_resolvable=false
on conflict (organization_id,issue_key) do update
set entity_id=excluded.entity_id,issue_type=excluded.issue_type,field_name=excluded.field_name,
    evidence_reference=excluded.evidence_reference,updated_at=now(),
    status=case when data_reconciliation_reviews.status='ignored' then 'ignored' else 'open' end;

insert into public.data_reconciliation_reviews
  (organization_id, issue_key, entity_type, entity_id, issue_type, field_name, status, evidence_reference, updated_at)
select organization_id,'laudus:cost_center_pending:'||external_id,'cost_center',canonical_cost_center_id,
  'cost_center_reconciliation_pending','cost_center','open',
  concat('laudus_cost_centers_service_v1:',external_id,
         ' | code=',coalesce(cost_center_code,''),
         ' | operational=',coalesce(operational_code,''),
         ' | name=',coalesce(name,''),
         ' | sync=',coalesce(synced_at::text,'null')),
  now()
from public.laudus_cost_centers_service_v1
where reconciliation_status='pending'
on conflict (organization_id,issue_key) do update
set entity_id=excluded.entity_id,evidence_reference=excluded.evidence_reference,updated_at=now(),
    status=case when data_reconciliation_reviews.status='ignored' then 'ignored' else 'open' end;
