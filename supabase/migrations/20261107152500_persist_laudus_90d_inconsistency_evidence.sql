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
select
  organization_id,
  'laudus:cxp_inconsistente:' || external_id || ':' || tipo_inconsistencia,
  'invoice',
  null,
  tipo_inconsistencia,
  campo_afectado,
  'open',
  concat('laudus_accounts_payable_service_v1:',external_id,
         ' | documento=',coalesce(document_number,''),
         ' | fecha_emision=',coalesce(issued_date::text,'sin_dato'),
         ' | fecha_vencimiento=',coalesce(due_date::text,'sin_dato'),
         ' | monto_original=',coalesce(original_amount::text,'sin_dato'),
         ' | saldo_pendiente=',coalesce(outstanding_amount::text,'sin_dato'),
         ' | proveedor=',coalesce(supplier_external_id,'sin_dato'),
         ' | moneda=',coalesce(currency_code,'sin_dato'),
         ' | sincronizado=',coalesce(synced_at::text,'sin_dato')),
  now()
from (
  select ap.*,
    case
      when issued_date is null then 'sin_fecha_emision'
      when due_date is null then 'sin_fecha_vencimiento'
      when due_date < issued_date then 'vencimiento_anterior_emision'
      when original_amount < 0 then 'monto_original_negativo'
      when outstanding_amount < 0 then 'saldo_pendiente_negativo'
      when outstanding_amount > original_amount then 'saldo_mayor_monto_original'
      when supplier_external_id is null then 'sin_proveedor'
      when nullif(btrim(document_number),'') is null then 'sin_numero_documento'
      when nullif(btrim(currency_code),'') is null then 'sin_moneda'
      else null
    end as tipo_inconsistencia,
    case
      when issued_date is null then 'fecha_emision'
      when due_date is null or due_date < issued_date then 'fecha_vencimiento'
      when original_amount < 0 then 'monto_original'
      when outstanding_amount < 0 or outstanding_amount > original_amount then 'saldo_pendiente'
      when supplier_external_id is null then 'proveedor'
      when nullif(btrim(document_number),'') is null then 'numero_documento'
      when nullif(btrim(currency_code),'') is null then 'moneda'
      else null
    end as campo_afectado
  from public.laudus_accounts_payable_service_v1 ap
  where ap.synced_at >= now()-interval '7 days'
) q
where tipo_inconsistencia is not null
on conflict (organization_id,issue_key) do update
set issue_type=excluded.issue_type,
    field_name=excluded.field_name,
    evidence_reference=excluded.evidence_reference,
    updated_at=now(),
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
where fully_resolvable=false
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


-- Proveedores nuevos o no conciliados: conservar como candidatos de revision, nunca promover automaticamente.
insert into public.data_reconciliation_reviews
  (organization_id, issue_key, entity_type, entity_id, issue_type, field_name, status, evidence_reference, updated_at)
select
  organization_id,
  'laudus:proveedor_candidato:' || external_id,
  'supplier',
  canonical_supplier_id,
  'proveedor_por_conciliar',
  'proveedor',
  'open',
  concat('laudus_suppliers_service_v1:',external_id,
         ' | rut=',coalesce(tax_id,'sin_dato'),
         ' | nombre=',coalesce(name,'sin_dato'),
         ' | razon_social=',coalesce(legal_name,'sin_dato'),
         ' | estado=',coalesce(reconciliation_status,'sin_dato'),
         ' | sincronizado=',coalesce(synced_at::text,'sin_dato')),
  now()
from public.laudus_suppliers_service_v1
where reconciliation_status='new_candidate'
on conflict (organization_id,issue_key) do update
set entity_id=excluded.entity_id,
    evidence_reference=excluded.evidence_reference,
    updated_at=now(),
    status=case when data_reconciliation_reviews.status='ignored' then 'ignored' else 'open' end;


-- Asignaciones de pago cuya factura referenciada aun no esta disponible en la capa Laudus local.
-- No invalida el pago: conserva la relacion como evidencia hasta completar o reconciliar la factura.
insert into public.data_reconciliation_reviews
  (organization_id, issue_key, entity_type, entity_id, issue_type, field_name, status, evidence_reference, updated_at)
select
  a.organization_id,
  'laudus:asignacion_pago_factura_no_resuelta:' ||
    a.payment_external_id || ':' || coalesce(a.payment_item_id,'sin_item') || ':' || a.purchase_invoice_external_id,
  'payment',
  null,
  'factura_referenciada_no_disponible',
  'factura',
  'open',
  concat('laudus_purchase_payment_allocations:',
         'pago=',a.payment_external_id,
         ' | item=',coalesce(a.payment_item_id,'sin_dato'),
         ' | factura=',a.purchase_invoice_external_id,
         ' | documento=',coalesce(a.doc_number,'sin_dato'),
         ' | proveedor=',coalesce(a.supplier_name,a.supplier_external_id,'sin_dato'),
         ' | monto_aplicado=',a.applied_amount::text,
         ' | moneda=',a.currency_code,
         ' | sincronizado=',coalesce(a.synced_at::text,'sin_dato')),
  now()
from integration.laudus_purchase_payment_allocations a
left join integration.laudus_purchase_invoices i
  on i.organization_id=a.organization_id
 and i.external_id=a.purchase_invoice_external_id
where i.id is null
on conflict (organization_id,issue_key) do update
set evidence_reference=excluded.evidence_reference,
    updated_at=now(),
    status=case when data_reconciliation_reviews.status='ignored' then 'ignored' else 'open' end;
