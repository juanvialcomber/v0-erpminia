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

## Contratos de lectura y actualización comprobados en código

- `app/api/maintenance/work-orders/route.ts`: consulta `maintenance_work_orders` con límite por `organization_id`, resuelve `canonical_asset_id` contra `maintenance_canonical_assets_v1` y registra eventos en `work_order_events` cuando corresponda al flujo de escritura. **Solo inspeccionado; no invocado para escribir**.
- `components/maintenance/work-orders-queue.tsx`: consume `/api/maintenance/work-orders` mediante SWR.
- `app/api/calendar/operational/route.ts`: consulta `maintenance_work_orders` con `scheduled_date`, en el rango solicitado y además `preventive_maintenance_schedules`.
- `components/operational-calendar/comfortable-operational-calendar.tsx`: consume `/api/calendar/operational?days=120&scope=...`, refresca cada 60 s.
- `app/api/maintenance/control-tower/route.ts`: consulta OT, equipos canónicos, flujo de abastecimiento, evidencias y revisiones.
- `components/maintenance/control-tower-screen.tsx`: consume `/api/maintenance/control-tower`, refresca cada 60 s.
- **Interpretación estricta**: existen contratos compartidos y polling de lectura. No se verificó todavía que todos los cambios de estado, responsable, pausa o reprogramación propaguen el resultado correcto, ni la relación completa con Ficha 360.

### Pruebas aisladas pendientes

1. Contratos de cambio de estado OT: verificar fixtures de pause/resume/close y lectura en calendario/torre, sin crear OT productivas.
2. Rango calendario 120 días vs pantallas, zona Santiago y días límite.
3. Identificar ruta de Ficha 360 y sus consultas canónicas antes de declarar integración completa.
4. Auditoría de RLS y privilegios en endpoints consumidores sin tocar permisos activos.

## Validación de contratos OT: estado y calendario

- Distribución actual en `maintenance_work_orders` (SELECT): 5 `completed`, 1 `in_progress`, 5 `open` (11 total). No se introdujeron estados ni OT de prueba.
- La API de Torre de Control clasifica `completed/closed` como terminadas; excluye `completed/closed/cancelled/canceled` de abiertas; cuenta `in_progress/in-progress/paused` como ejecución. Con la distribución actual se esperan 5 cerradas, 6 abiertas y 1 en ejecución, condicionadas al alcance por organización y filtros de endpoint.
- El calendario consulta `scheduled_date` en ventana temporal solicitada y usa `includeForScope`: `active` excluye históricos, `historical` incluye históricos y el modo general incluye ambos. **No comparar totales del calendario con la totalidad de OT sin considerar rango temporal y scope.**
- El calendario toma fecha de finalización de `completion_date || closed_at` y la Torre compara estado de OT para KPI. Confirmar coherencia de zona horaria Santiago en tests futuros.

### Riesgo a comprobar (sin cambios ahora)

- Variantes de `paused`, `in-progress`, `closed` y `cancelled` pueden tener tratamiento diferente entre vistas. Necesario un contrato común de estado y pruebas de fixtures sin escribir en producción.
- La Ficha 360 sigue sin ruta/contrato confirmado en esta auditoría; no declarar interoperabilidad total hasta localizar su consumo.
- Validación actual es estática/código + SELECT; no se ejecutaron flujos reales de pausa/reanudación/cierre.

## Ficha 360 — contrato localizado (inspección estática)

- Ruta real: `app/dashboard/mantenimiento/equipos/[id]/ficha/page.tsx`. Composición: `Asset360Overview`, `AssetHseControls`, `AssetEconomicOperationalHistory`, `AssetEconomicConditionTrend`.
- Navegación: `components/maintenance/equipment-sheet.tsx` enlaza a esa ficha desde la lista; `components/maintenance/equipment-list.tsx` consulta `/api/maintenance/equipment`.
- `components/maintenance/asset-360-overview.tsx` consume `/api/maintenance/assets/{assetId}/operational-360` con SWR. Contempla órdenes, cierres y evidencia operativa.
- `components/maintenance/asset-economic-operational-history.tsx` consume `/api/maintenance/assets/{assetId}/economic-operational-history`, con campos de eventos financieros vinculados a OT y OT activas.
- `app/api/maintenance/equipment/route.ts` ensambla `canonical_assets_current` con cierres, mantenimientos preventivos, horómetros y vistas de confiabilidad usando `canonical_asset_id`.

**Hallazgo:** Ficha 360 ya está implementada y conectada mediante endpoints especializados. Integración de código verificada; falta verificar contratos backend internos y consistencia de datos en cada sección. No crear una segunda Ficha 360.

### Próximas pruebas aisladas

1. Leer GET de `operational-360` y `economic-operational-history` para comprobar relaciones y filtros de organización.
2. Revisar estados de OT en fixtures de calendario/torre/ficha; no crear, pausar ni cerrar OT reales.
3. Priorizar pruebas documentales o tests aislados sin despliegue y sin cambios de esquema.

## Contratos backend de Ficha 360 — auditoría estática

- `app/api/maintenance/assets/[id]/operational-360/route.ts` y `app/api/maintenance/assets/[id]/economic-operational-history/route.ts` exigen `requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES)` y `getOrganizationContext(request)`, y rechazan acceso cuando no están autorizados o no existe contexto.
- Operacional 360 consulta activos canónicos, OT, catálogos de productos, proveedores, órdenes de compra y datos de cierre. En las consultas inspeccionadas se filtra por `organization_id`.
- Histórico económico consulta `canonical_clp_cost_ledger`, confiabilidad, flujo de OT, preventivos, horómetros y fuentes de producción. En las consultas inspeccionadas se observan filtros por organización y equipo.
- **Evidencia disponible:** contrato estático del código. No se ha probado RLS en sesión real, resultados endpoint, ni correspondencia de montos y contadores. No dar por aprobado el QA multirol.

### Casos de regresión planificados (aislados)

| Prueba | Aserción | Nivel |
|---|---|---|
| Usuario sin permiso | GET operacional e histórico deben rechazarlo | Pendiente |
| Activo de otra organización | Ningún dato ajeno a su organización | Pendiente |
| OT abierta/cerrada | Resúmenes muestran solo el estado/fecha que corresponda | Pendiente |
| OT pausada | No es cerrada; tiempo y ejecución conservan semántica | Pendiente |
| Evento sin vínculo a OT | Se conserva como compra general, no se fuerza enlace | Pendiente |
| Ledger económico | Totales y estado de reconocimiento se conservan | Pendiente |
| Sin historial disponible | Mostrar estado vacío verificable, no cero inventado | Pendiente |

No invocar POST/PATCH ni endpoints con efectos secundarios contra producción para estas pruebas.

## Regresión automatizable: contratos estáticos añadidos

Archivo: `tests/motil-os-integration-contracts.test.mjs` (Node `node:test`; **sin llamadas de red ni escrituras**).

Incluye: permiso MANT_OPERACIONES y contexto organizacional en ambos GET de Ficha 360, fuentes canónicas de OT/activos/compras, ledger económico, consumo OT por calendario/torre y uso del catálogo canónico en listado de equipos.

**Alcance real:** pruebas estáticas sobre código fuente; aún no ejecutadas en CI. No prueban RLS real, cambios de estado efectivos, temporización, exactitud numérica ni permisos entre usuarios. Próximo paso: ejecutar en CI aislado y ampliar fixtures de comportamiento con mocks. Prohibido activar tests de escritura contra Supabase productivo.

## Revisión RLS real: sólo metadatos PostgreSQL

- `maintenance_work_orders`: RLS habilitado. Política `work_orders_org_isolation`, rol `authenticated`, comando `ALL`; condición de lectura y escritura valida `organization_id` contra `user_roles` para `current_application_user_id()`.
- `work_order_events`: RLS habilitado. Política `work_order_events_org_isolation`, rol `public`, comando `SELECT`; también restringe por organización del usuario efectivo según `current_application_user_id()`. El rol `public` en la definición no equivale a acceso irrestricto: la condición RLS sigue siendo relevante. Confirmar grants y resultado real con un usuario sin asociación.
- Ambas APIs de Ficha 360 exigen permiso `MANT_OPERACIONES` y contexto de organización, con filtros `organization_id` en sus consultas. No se ha ejecutado una prueba autenticada entre organizaciones.

### Release gate pendiente

Antes de certificar la protección multiempresa: escenarios de usuario de una organización A intentando leer activo y OT de B, pruebas para usuario sin rol, e inspección de grants y vistas consumidas. No ejecutar estas pruebas con cambios a datos de Ariel.

## Seguridad de vistas económicas, confiabilidad y producción — lectura de catálogo

Verificado en `pg_class`: `canonical_clp_cost_ledger`, `maintenance_reliability_by_asset_v1`, `maintenance_reliability_by_root_cause_v1`, `maintenance_operational_work_order_flow_v1` y `asset_runtime_summary_v1` son vistas con `security_invoker=true`. Esto delega privilegios/RLS a sus relaciones subyacentes, pero no equivale por sí solo a un QA autenticado.

`production_drilling_source_reports` es tabla con RLS habilitado y sin políticas visibles en `pg_policies`; podría resultar inaccesible a roles ordinarios. No alterar políticas: verificar primero si el endpoint tolera ausencia de datos, cuál es el contexto efectivo de credenciales y si existen pruebas reales de lectura.

**Acción segura siguiente:** inspeccionar manejo de errores `production_drilling_source_reports` del endpoint económico y permisos efectivos sin cambiar datos, roles, grants o políticas.

## Hallazgo confirmado: disponibilidad de reporte de perforación

- `production_drilling_source_reports` tiene RLS habilitado sin políticas visibles. La consulta a `information_schema.role_table_grants` mostró privilegios para `service_role`, no para `authenticated` ni `anon`. Esto no determina por sí mismo el rol efectivo del contexto Supabase de la API.
- `economic-operational-history/route.ts` incluye esa consulta entre las fuentes en `Promise.all` y agrega `operationalReportsResult.error` al fallo global `sourceError`, por lo que un rechazo puede producir HTTP 500 de toda la Ficha 360 económica.
- **Recomendación de diseño:** gestionar explícitamente la indisponibilidad de una fuente complementaria sin convertir datos ausentes en cero ni modificar permisos de producción; registrar estado `unavailable` y conservar costos/mantenimiento cuando el contrato lo permita. Requiere revisar semánticas de salida y tests antes de aplicar el cambio.
- Bloqueo: comprobar si `getOrganizationContext` usa permisos de usuario o rol de servicio para esa consulta. No habilitar grants ni relajar RLS como solución rápida.
