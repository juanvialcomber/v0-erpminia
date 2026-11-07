-- Vista de negocio para conciliar factura -> origen/OC -> CxP -> pago -> saldo.
-- No promueve ni modifica datos canonicos. Expone una conclusion en espanol y conserva trazabilidad fuente.

create or replace view public.laudus_financial_chain_service_v1 as
with allocation_amount as (
  select
    organization_id,
    purchase_invoice_external_id,
    count(*) as allocation_rows,
    count(distinct original_amount) filter (where original_amount is not null) as distinct_original_amounts,
    min(original_amount) filter (where original_amount is not null) as single_original_amount,
    sum(applied_amount) as allocated_paid_amount
  from integration.laudus_purchase_payment_allocations
  group by organization_id,purchase_invoice_external_id
),
trace as (
  select
    organization_id,
    invoice_external_id,
    count(*) as trace_rows,
    count(*) filter (where resolution_status='exact_purchase_order') as exact_po_rows,
    count(*) filter (where resolution_status='exact_waybill') as exact_waybill_rows,
    count(*) filter (where resolution_status='ambiguous_id') as ambiguous_rows,
    count(*) filter (where resolution_status='unresolved') as unresolved_rows,
    count(distinct purchase_order_external_id) filter (where purchase_order_external_id is not null) as purchase_order_count,
    string_agg(distinct purchase_order_number, ', ' order by purchase_order_number)
      filter (where purchase_order_number is not null) as purchase_order_numbers,
    count(distinct waybill_external_id) filter (where waybill_external_id is not null) as waybill_count,
    string_agg(distinct waybill_number::text, ', ' order by waybill_number::text)
      filter (where waybill_number is not null) as waybill_numbers
  from integration.laudus_purchase_invoice_trace_resolution_v1
  group by organization_id,invoice_external_id
)
select
  i.organization_id,
  i.external_id as invoice_external_id,
  i.doc_number as numero_factura,
  i.supplier_name as proveedor,
  i.supplier_tax_id as rut_proveedor,
  i.issued_date as fecha_emision,
  i.due_date as fecha_vencimiento,
  i.total_amount as monto_factura_fuente,
  case
    when i.total_amount is not null then i.total_amount
    when aa.distinct_original_amounts=1 and aa.single_original_amount>0 then aa.single_original_amount
    else null
  end as monto_factura_conciliado,
  case
    when i.total_amount is not null then 'factura_laudus'
    when aa.distinct_original_amounts=1 and aa.single_original_amount>0 then 'asignacion_pago_laudus'
    when coalesce(aa.distinct_original_amounts,0)>1 then 'conflicto_asignaciones_pago'
    else 'monto_fuente_faltante'
  end as fuente_monto,
  i.currency as moneda,
  p.payment_status as estado_pago_fuente,
  coalesce(p.paid_amount,0) as monto_pagado,
  case
    when i.total_amount is not null then p.outstanding_amount
    when aa.distinct_original_amounts=1 and aa.single_original_amount>0
      then greatest(aa.single_original_amount-coalesce(p.paid_amount,0),0)
    else null
  end as saldo_conciliado,
  coalesce(p.payment_count,0) as cantidad_pagos,
  p.last_payment_at as ultimo_pago,
  case
    when p.payment_status='credit_adjustment' then 'ajuste_credito'
    when i.total_amount is null and coalesce(aa.distinct_original_amounts,0)>1 then 'monto_conflictivo'
    when i.total_amount is null and coalesce(aa.distinct_original_amounts,0)=0 then 'monto_desconocido'
    when coalesce(p.paid_amount,0)<=0 then 'no_pagada'
    when coalesce(p.paid_amount,0)+0.005 >=
      coalesce(i.total_amount,case when aa.distinct_original_amounts=1 then aa.single_original_amount end)
      then 'pagada'
    else 'parcialmente_pagada'
  end as estado_pago_conciliado,
  ap.quality_status as calidad_cxp,
  ap.freshness_status as vigencia_cxp,
  ap.outstanding_amount as saldo_cxp,
  coalesce(t.trace_rows,0) as trazas_origen,
  coalesce(t.purchase_order_count,0) as cantidad_oc_origen,
  t.purchase_order_numbers as ordenes_compra_origen,
  coalesce(t.waybill_count,0) as cantidad_guias_origen,
  t.waybill_numbers as guias_origen,
  case
    when coalesce(t.trace_rows,0)=0 then 'sin_trazabilidad_origen'
    when coalesce(t.ambiguous_rows,0)>0 then 'origen_ambiguo'
    when coalesce(t.purchase_order_count,0)=1 and coalesce(t.unresolved_rows,0)=0 then 'oc_identificada'
    when coalesce(t.purchase_order_count,0)>1 then 'multiples_oc_origen'
    when coalesce(t.waybill_count,0)>0 and coalesce(t.purchase_order_count,0)=0 then 'guia_identificada_sin_oc'
    when coalesce(t.unresolved_rows,0)>0 then 'origen_no_resuelto'
    else 'trazabilidad_parcial'
  end as estado_origen,
  case
    when p.payment_status='credit_adjustment' then 'ajuste_credito'
    when i.total_amount is null and coalesce(aa.distinct_original_amounts,0)>1 then 'conflicto_monto_asignaciones'
    when i.total_amount is null and coalesce(aa.distinct_original_amounts,0)=0 then 'factura_sin_monto_fuente'
    when i.total_amount is null
      and aa.distinct_original_amounts=1
      and aa.single_original_amount>0
      and coalesce(p.paid_amount,0)+0.005>=aa.single_original_amount
      then 'pago_completo_derivado'
    when ap.quality_status='verificado'
      and abs(coalesce(ap.outstanding_amount,0)-coalesce(p.outstanding_amount,0))<=0.01
      then 'cxp_pago_saldo_conciliados'
    when ap.quality_status is null then 'sin_cxp_verificada'
    else 'requiere_revision_financiera'
  end as estado_financiero,
  case
    when p.payment_status='credit_adjustment' then 'ajuste_credito'
    when i.total_amount is null and coalesce(aa.distinct_original_amounts,0)>1 then 'requiere_revision_monto'
    when i.total_amount is null and coalesce(aa.distinct_original_amounts,0)=0 then 'requiere_reparar_factura'
    when i.total_amount is null
      and aa.distinct_original_amounts=1
      and aa.single_original_amount>0
      and coalesce(p.paid_amount,0)+0.005>=aa.single_original_amount
      then case
        when coalesce(t.trace_rows,0)=0 then 'pagada_derivada_sin_origen'
        when coalesce(t.purchase_order_count,0)=1 then 'pagada_derivada_con_oc'
        else 'pagada_derivada_trazabilidad_parcial'
      end
    when ap.quality_status<>'verificado' or ap.quality_status is null then 'requiere_revision_financiera'
    when abs(coalesce(ap.outstanding_amount,0)-coalesce(p.outstanding_amount,0))>0.01 then 'conflicto_saldo'
    when coalesce(t.trace_rows,0)=0 then 'finanzas_conciliadas_sin_origen'
    when coalesce(t.ambiguous_rows,0)>0 or coalesce(t.unresolved_rows,0)>0 then 'finanzas_conciliadas_origen_por_revisar'
    when coalesce(t.purchase_order_count,0)=1 then 'cadena_conciliada_con_oc'
    when coalesce(t.waybill_count,0)>0 then 'cadena_conciliada_hasta_guia'
    else 'finanzas_conciliadas_trazabilidad_parcial'
  end as estado_cadena,
  i.synced_at as actualizado_desde_laudus
from integration.laudus_purchase_invoices i
join integration.laudus_purchase_invoice_payment_status_v1 p
  on p.organization_id=i.organization_id
 and p.purchase_invoice_external_id=i.external_id
left join allocation_amount aa
  on aa.organization_id=i.organization_id
 and aa.purchase_invoice_external_id=i.external_id
left join public.laudus_accounts_payable_quality_v1 ap
  on ap.organization_id=i.organization_id
 and ap.purchase_invoice_external_id=i.external_id
left join trace t
  on t.organization_id=i.organization_id
 and t.invoice_external_id=i.external_id;

grant select on public.laudus_financial_chain_service_v1 to authenticated,service_role;
