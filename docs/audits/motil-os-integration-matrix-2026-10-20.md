# MOTIL OS — Matriz de integración (auditoría aislada)

Fecha: 2026-10-20. Consultas exclusivamente SELECT a MOTIL. No implica permiso de escritura ni merge.

## Principio arquitectónico

MOTIL es un único OS: eventos con identidad y evidencia común que alimentan múltiples vistas y procesos. No confundir existencia de columnas con automatización implementada ni ausencia de work_order_id con falla en compras generales.

| Evento/productor | Clave observada | Consumidores que debemos verificar | Resultado de integridad observado | Estado |
|---|---|---|---|---|
| Alta/identidad de equipo | maintenance_canonical_assets_v1.id | OT, ficha 360, planificación, torre, costos | 188 activos; 11/11 OT con canonical_asset_id válido | Referencia OT validada |
| Actividad de OT | work_order_events.work_order_id | OT, calendario, ficha 360, torre, auditoría | 125/125 eventos unidos a maintenance_work_orders.id | Integridad relacional validada; propagación UI pendiente |
| Requerimiento de material | work_order_material_requirements.work_order_id | bodega, compras, agenda, OT | 6 faltantes y procurement_needed | Pendiente verificar estado posterior |
| Instalación confirmada | work_order_material_approval_installations.work_order_id | ficha 360, bodega, costos | 6/6 confirmaciones con OT y conciliación informada | Integridad relacional validada; stock pendiente |
| Eventos de compras | canonical_procurement_events_v1.request_id / purchase_order_id / work_order_id | compras, bodega, finanzas | 5 eventos, todos sin work_order_id ni canonical_asset_id | No inferir error; verificar vínculo indirecto |
| Pipeline de abastecimiento | operational_procurement_pipeline.intake_request_id / order_id | compras, recepción, bodega | 3 registros, todos sin work_order_id ni canonical_asset_id | No inferir error; pueden ser compras generales |
| Ledger de compras-finanzas | operational_procurement_finance_ledger_v1.source_record_id / work_order_id | finanzas, costos, compras | 4 registros, todos sin work_order_id ni canonical_asset_id | Auditar enlaces por documentos, sin escribir |
| Estado de máquina | maintenance_asset_status_history.asset_id | ficha 360, torre, disponibilidad | 7 eventos asset_insert=active | Alta no prueba condición operacional actual |

## Próximas comprobaciones (solo lectura)

1. Cruzar solicitudes, órdenes, recepciones y ledger por IDs de documento; comprobar si compras generales son independientes de OT.
2. Revisar propagación de eventos de OT a ficha 360, torre, calendario y planificación desde código y consultas sin ejecutar mutaciones.
3. Distinguir requerimiento faltante histórico, compra realizada, material instalado y conciliación de bodega.
4. Completar matriz de permisos/RLS por rol sin usar identidades operativas ni iniciar transacciones.

## Protección Ariel

No se modifican OT, cron, WhatsApp, correos, stock, permisos, estados, despliegues, ni integraciones activas. Cualquier cambio futuro requiere pruebas aisladas, release gate y autorización de merge.

## Auditoría de enlaces indirectos — segundo pase

- Compras: 5/5 eventos tienen `request_id` y 5/5 enlazan con una solicitud existente en `canonical_procurement_requests_v1`. 3/5 eventos referencian orden de compra; 1/5 referencia recepción.
- Pipeline: 3/3 filas referencian solicitudes (`intake_request_id`), 3/3 tienen orden y 3/3 registran al menos una recepción. Esto no significa que la recepción esté conciliada o completa.
- Ledger: 4 entradas, desglosadas en 1 `purchase_commitment` desde `procurement_operational_order_lines` y 3 `procurement_receipt_cost` desde `procurement_operational_receipt_lines`.
- Al no referenciar directamente OT, **no** crear nuevos enlaces automáticos sin identificar intención, organización, línea de compra y origen. Podrían ser compras generales.

### Pendiente

- Validar claves de documento y organización desde órdenes, recepción y líneas hacia eventos y ledger.
- Revisar consumidores de código OT -> Ficha 360, calendario y Torre de Control. La presencia de datos en SQL no prueba actualización de interfaz en tiempo real.
