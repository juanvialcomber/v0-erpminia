# Modelo de evidencia Legal / Laudus

## Fuentes MOTIL

- `contracts`: contrato, valor contractual, proveedor y resumen pagado. `paid_amount` es resumen contractual; no usarlo para atribuir una factura concreta.
- `contract_progress_updates`: avances persistidos cuando existan. Si esta vacio, usar archivo fuente trazable sin fingir persistencia.
- `legal_contract_purchase_order_links`: ledger de conciliacion contrato-OC con estados `pending`, `verified`, `conflict`, `not_found`.
- `integration.laudus_purchase_orders`: OC Laudus real. En la integracion actual `external_id/purchaseOrderId` representa el numero visible y `order_number` debe normalizarse desde ese valor cuando sea numerico.
- `laudus_purchase_invoice_payment_status_service_v1`: factura y estado de pago. Campos relevantes: `doc_number`, `supplier_external_id`, `issued_date`, `total_amount`, `paid_amount`, `outstanding_amount`, `payment_count`, `last_payment_at`, `payment_status`.
- `finance_payment_requests`: solicitudes internas de pago cuando el flujo este activo; no confundir solicitud con pago ejecutado.

## Fuente contractual de Elias

Archivo inicial: `Planilla Avance Contratos - Con resumen.xlsx`.
Conservar hash, hoja y fila/celda cuando un dato derive del workbook.

La planilla contiene segun contrato:
- OC;
- actividades/hitos;
- porcentaje de avance;
- monto ejecutado;
- monto facturado;
- pendiente de facturar;
- retencion;
- numeros de factura.

El workbook es evidencia contractual/operacional. No es autoridad de pago.

## Precedencia

- Avance fisico: planilla/hito aprobado > resumen derivado.
- OC: Laudus staging/canon > texto de planilla.
- Factura: Laudus por proveedor + numero exacto.
- Pago: Laudus/payment source autorizada.
- Retencion: contrato/planilla + saldo Laudus coincidente.

## Match permitido

- Contrato-OC: numero de OC + proveedor/RUT compatible.
- Factura: proveedor Laudus exacto + `doc_number` exacto.
- Retencion: `payment_status=partially_paid` y `abs(outstanding-retention)` dentro de tolerancia material.

No usar similitud de nombre, cercania de fecha o monto aproximado como prueba suficiente de atribucion financiera.
