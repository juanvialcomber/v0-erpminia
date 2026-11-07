-- Trusted 90-day Laudus slices and area-level alert candidates.
create or replace view public.laudus_accounts_payable_trusted_90d_v1 as
select *
from public.laudus_accounts_payable_service_v1
where coalesce(issued_date, source_updated_at, observed_at) >= now() - interval '90 days'
  and issued_date is not null
  and due_date is not null
  and due_date >= issued_date
  and original_amount >= 0
  and outstanding_amount >= 0
  and outstanding_amount <= original_amount
  and supplier_external_id is not null
  and nullif(btrim(document_number),'') is not null
  and nullif(btrim(currency_code),'') is not null;

create or replace view public.laudus_inventory_trusted_90d_v1 as
select *
from public.laudus_inventory_reconciliation_service_v1
where reconciliation_state='aligned'
  and laudus_synced_at >= now()-interval '90 days'
  and motil_updated_at >= now()-interval '90 days';

create or replace view public.laudus_area_alert_candidates_90d_v1 as
with candidates as (
  select organization_id,'finance'::text area,'Gerente de Finanzas'::text owner_cargo,
         'laudus:finance:overdue_90d'::text alert_key,'warning'::text severity,
         'CxP vencidas en corte confiable de 90 días'::text title,
         count(*)::bigint exception_count,coalesce(sum(outstanding_amount),0)::numeric amount,
         max(synced_at) source_synced_at,
         'Revisar vencidos por proveedor y definir programación de pago o excepción documentada.'::text recommended_action
  from public.laudus_accounts_payable_trusted_90d_v1
  where outstanding_amount>0 and due_date<now()
  group by organization_id
  union all
  select organization_id,'finance','Gerente de Finanzas','laudus:finance:due_7d','info',
         'CxP con vencimiento en los próximos 7 días',count(*)::bigint,
         coalesce(sum(outstanding_amount),0)::numeric,max(synced_at),
         'Revisar caja y confirmar cuáles pagos deben programarse durante los próximos 7 días.'
  from public.laudus_accounts_payable_trusted_90d_v1
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
  where issue_key like 'laudus:%' and entity_type in ('invoice','purchase_order','cost_center') and status='open'
  group by organization_id
)
select * from candidates where exception_count>0;
