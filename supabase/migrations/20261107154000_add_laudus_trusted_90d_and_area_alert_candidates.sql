-- Laudus quality-preserving slices and area-level alert candidates.
-- Principle: document age is context, not an exclusion criterion.
-- Finance can retain old obligations when the source was synced recently and the row is internally consistent.
-- Inventory remains freshness-sensitive because stale stock can harm operations.

create or replace view public.laudus_accounts_payable_quality_v1 as
select
  ap.*,
  greatest(0, floor(extract(epoch from (now() - ap.issued_date)) / 86400))::bigint as age_days,
  case
    when ap.synced_at >= now() - interval '7 days' then 'fresh'
    else 'stale'
  end as freshness_status,
  case
    when ap.issued_date is null then 'invalid_missing_issued_date'
    when ap.due_date is null then 'invalid_missing_due_date'
    when ap.due_date < ap.issued_date then 'invalid_due_before_issue'
    when ap.original_amount < 0 then 'invalid_negative_original'
    when ap.outstanding_amount < 0 then 'invalid_negative_outstanding'
    when ap.outstanding_amount > ap.original_amount then 'invalid_outstanding_gt_original'
    when ap.supplier_external_id is null then 'invalid_missing_supplier'
    when nullif(btrim(ap.document_number),'') is null then 'invalid_missing_document_number'
    when nullif(btrim(ap.currency_code),'') is null then 'invalid_missing_currency'
    when ps.purchase_invoice_external_id is not null
         and ps.outstanding_amount is distinct from ap.outstanding_amount then 'conflict_payment_balance'
    when ps.purchase_invoice_external_id is not null then 'verified'
    else 'valid_unverified'
  end as quality_status,
  ps.payment_status as corroborated_payment_status,
  ps.paid_amount as corroborated_paid_amount,
  ps.outstanding_amount as corroborated_outstanding_amount,
  ps.payment_count as corroborated_payment_count,
  ps.last_payment_at as corroborated_last_payment_at
from public.laudus_accounts_payable_service_v1 ap
left join public.laudus_purchase_invoice_payment_status_service_v1 ps
  on ps.organization_id = ap.organization_id
 and ps.purchase_invoice_external_id = ap.purchase_invoice_external_id;

create or replace view public.laudus_accounts_payable_trusted_v1 as
select *
from public.laudus_accounts_payable_quality_v1
where freshness_status='fresh'
  and quality_status in ('verified','valid_unverified');

-- Compatibility/detail slice: retain the 90-day view for consumers that explicitly need recent documents.
create or replace view public.laudus_accounts_payable_trusted_90d_v1 as
select *
from public.laudus_accounts_payable_trusted_v1
where coalesce(issued_date, source_updated_at, observed_at) >= now() - interval '90 days';

-- Inventory is a current-state domain: only aligned, recently observed stock is trusted.
create or replace view public.laudus_inventory_trusted_90d_v1 as
select *
from public.laudus_inventory_reconciliation_service_v1
where reconciliation_state='aligned'
  and laudus_synced_at >= now()-interval '90 days'
  and motil_updated_at >= now()-interval '90 days';

create or replace view public.laudus_area_alert_candidates_90d_v1 as
with candidates as (
  select organization_id,'finance'::text area,'Gerente de Finanzas'::text owner_cargo,
         'laudus:finance:overdue_trusted'::text alert_key,'warning'::text severity,
         'CxP vencidas vigentes y consistentes'::text title,
         count(*)::bigint exception_count,coalesce(sum(outstanding_amount),0)::numeric amount,
         max(synced_at) source_synced_at,
         'Revisar vencidos por proveedor y definir programación de pago o excepción documentada.'::text recommended_action
  from public.laudus_accounts_payable_trusted_v1
  where outstanding_amount>0 and due_date<now()
  group by organization_id

  union all

  select organization_id,'finance','Gerente de Finanzas','laudus:finance:historical_open','info',
         'CxP históricas que Laudus aún mantiene abiertas',count(*)::bigint,
         coalesce(sum(outstanding_amount),0)::numeric,max(synced_at),
         'Conciliar obligaciones antiguas por proveedor y documento; no descartarlas sólo por antigüedad.'
  from public.laudus_accounts_payable_trusted_v1
  where outstanding_amount>0
    and issued_date < now()-interval '365 days'
  group by organization_id

  union all

  select organization_id,'finance','Gerente de Finanzas','laudus:finance:due_7d','info',
         'CxP con vencimiento en los próximos 7 días',count(*)::bigint,
         coalesce(sum(outstanding_amount),0)::numeric,max(synced_at),
         'Revisar caja y confirmar cuáles pagos deben programarse durante los próximos 7 días.'
  from public.laudus_accounts_payable_trusted_v1
  where outstanding_amount>0 and due_date between now() and now()+interval '7 days'
  group by organization_id

  union all

  select organization_id,'inventory','JEFE BODEGA','laudus:inventory:negative_stock','warning',
         'Stock negativo reportado por Laudus',count(*)::bigint,sum(abs(warehouse_stock))::numeric,max(synced_at),
         'Revisar movimientos y conteo físico antes de corregir stock; conservar Laudus como evidencia, no sobrescribir MOTIL automáticamente.'
  from public.laudus_negative_stock_positions_service_v1
  where synced_at>=now()-interval '90 days'
  group by organization_id

  union all

  select organization_id,'inventory','JEFE BODEGA','laudus:inventory:process_consumable_mismatch','warning',
         'Diferencias de stock en consumibles de proceso',count(*)::bigint,sum(abs(quantity_delta))::numeric,
         greatest(max(laudus_synced_at),max(motil_updated_at::timestamptz)),
         'Conciliar primero combustibles/explosivos y registrar cuál fuente representa el stock físico vigente.'
  from public.laudus_inventory_reconciliation_service_v1
  where reconciliation_state='quantity_mismatch'
    and operational_category='process_consumable'
    and laudus_synced_at>=now()-interval '7 days'
    and motil_updated_at>=now()-interval '7 days'
  group by organization_id

  union all

  select organization_id,'inventory','JEFE BODEGA','laudus:inventory:maintenance_supply_mismatch','info',
         'Diferencias de stock en repuestos/insumos de mantenimiento',count(*)::bigint,sum(abs(quantity_delta))::numeric,
         greatest(max(laudus_synced_at),max(motil_updated_at::timestamptz)),
         'Conciliar las diferencias; escalar a Mantenimiento sólo si un faltante bloquea una OT activa.'
  from public.laudus_inventory_reconciliation_service_v1
  where reconciliation_state='quantity_mismatch'
    and operational_category='maintenance_supply'
    and laudus_synced_at>=now()-interval '7 days'
    and motil_updated_at>=now()-interval '7 days'
  group by organization_id

  union all

  select organization_id,'finance','Gerente de Finanzas','laudus:finance:source_anomaly','info',
         'Inconsistencias de fuente Laudus aisladas',count(*)::bigint,null::numeric,max(updated_at),
         'Revisar sólo las excepciones abiertas; excluirlas de cálculos automáticos hasta resolverlas.'
  from public.data_reconciliation_reviews
  where issue_key like 'laudus:%'
    and entity_type in ('invoice','purchase_order','cost_center')
    and status='open'
  group by organization_id

  union all

  select organization_id,'finance','Gerente de Finanzas','laudus:finance:quality_conflict','warning',
         'CxP Laudus con conflicto de integridad o saldo',count(*)::bigint,
         coalesce(sum(outstanding_amount),0)::numeric,max(synced_at),
         'Revisar estas obligaciones antes de usarlas en caja, programación de pagos o reportes.'
  from public.laudus_accounts_payable_quality_v1
  where freshness_status='fresh'
    and quality_status not in ('verified','valid_unverified')
  group by organization_id
)
select * from candidates where exception_count>0;
