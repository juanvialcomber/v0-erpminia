# MOTIL — Auditoría segura de integridad (2026-10-20)

## Alcance y límites

Auditoría de solo lectura de Supabase MOTIL `ttlptyheuqeotadtcbaw`. No ejecutar modificaciones a OT, estado de equipos, inventario, producción, jobs, correo ni WhatsApp. No mezclar pruebas con la operación real de Ariel. No realizar merge sin autorización explícita.

## Hallazgos verificados

- `maintenance_canonical_assets_v1`: 188 registros; 0 sin `asset_code`, 0 sin `validation_status`.
- `maintenance_work_orders`: 11 registros. Los 11 tienen `asset_id` legado vacío, pero **11/11 tienen `canonical_asset_id` válido que enlaza con `maintenance_canonical_assets_v1`**. No hay OT huérfanas. No reparar ni poblar `asset_id` por este hallazgo.
- `maintenance_asset_status_history`: 7 eventos; todos con identificador de equipo y `source`.

## Reglas para los skills de MOTIL

1. **Canonical Intake:** resolver equipos por `canonical_asset_id` antes de marcar vínculos faltantes; verificar coincidencia con el catálogo; no modificar referencias automáticamente.
2. **Maintenance Development:** probar OT y datos por consulta de solo lectura, respetando el flujo de Ariel. Ninguna OT ficticia en producción.
3. **Frida:** comparar pantallas responsive contra información real, sin cambios en rutas operacionales.
4. **Ciclope:** revisar permisos y contratos API sin migraciones o actualizaciones en producción. Los hallazgos requieren evidencia y plan de rollback previo a cualquier implementación.
5. **Evaluación:** los puntajes de módulos son hipótesis de calidad, no métricas medidas. Registrar evidencia de tests y QA antes de elevar un score.

## Próxima auditoría aislada

Inspeccionar sin modificar: claves entre OT y equipos, coherencia de estados temporales, materiales reservados vs consumidos y permisos por rol. Generar issues o PR documentales sin merge automático.
