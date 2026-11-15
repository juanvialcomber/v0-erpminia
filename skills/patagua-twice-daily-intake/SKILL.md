---
name: patagua-twice-daily-intake
description: Conciliar y recuperar automáticamente dos veces al día la evidencia canónica de origen enviada por correo @lapatagua.cl y grupos WhatsApp habilitados hacia MOTIL; auditar atraso, duplicados, adjuntos, clasificación, promoción y freshness.
---

# Contrato de ingesta La Patagua

## SLA
- Ejecutar conciliación a las 08:00 y 20:00 America/Santiago, con zona horaria real y DST. Un scheduler UTC fijo no garantiza ambas horas locales.
- Mantener los cron de historia y medios WhatsApp existentes: su frecuencia es mayor, pero no sustituye la conciliación canónica.
- Al iniciar cada corrida enumerar universo Gmail desde el último cursor exitoso con ventana solapada, y mensajes Green API desde el último cursor exitoso. Reconciliar por IDs exactos; nunca por nombre de archivo.
- Incluir mensajes de correo sin adjuntos y respuestas de responsables que corrijan datos previos.
- Descargar adjuntos, preservar bytes, hash SHA256, timestamps y origen. Clasificar por área y procesar todas las hojas de Excel.
- Fuente oficial es evidencia canónica de origen. Promover automáticamente sólo identidad inequívoca, dato consistente y dominio sin aprobación obligatoria; preservar conflictos para revisión sin bloquear otros registros.
- No generar ni aprobar OT automáticamente a partir de mensajes.
- No sobrescribir estado nuevo con evidencia antigua.
- La cobertura es por fecha efectiva de reporte, no por fecha de recepción.
- Reportar elegibles = procesados + duplicados justificados + excepciones. Alertar si diferencia no es cero, si la última fuente queda atrasada o si faltan adjuntos.
- Verificar downstream en módulos MOTIL, no declarar éxito por HTTP 200.

## Estado detectado 2026-11-15
- MOTIL Supabase: ttlptyheuqeotadtcbaw; verificar organización antes de escribir.
- motil_email_source_manifest: 110 filas, último email registrado 2026-11-06.
- motil_whatsapp_messages: 1907 filas, último evento 2026-11-14.
- motil_whatsapp_attachments: 1520 filas; 1479 stored, 38 unavailable y 3 unsupported.
- No declarar que los datos están al día sin backfill real y reconciliación.

## Implementación
- Integrar scheduler real, cursor persistente y worker idempotente en la aplicación; esta skill por sí sola no programa ni ejecuta tareas.
- Verificar CRON_SECRET, scopes y logs sin revelar secretos.
- Ejecutar backfill acotado hasta fecha actual; revisar y reintentar fallas.
- Validar con QA y exact SHA antes de promover a producción.

## Hallazgo de cobertura Gmail 2026-11-15
- Consulta `from:(@lapatagua.cl) after:2026/11/06`: 38 mensajes, sin siguiente página; incluye respuestas y archivos de Don Jaime, Peumo, San Pedro, Raíz del Cobre y planificación.
- La tarea `patagua-reconcile` solo verifica frescura y recupera WhatsApp: NO importa Gmail. No promoverla como solución completa.
- Prioridad de implementación: worker autenticado de Gmail, paginación, lectura de cada mensaje, adjuntos con hash, staging y reconciliación por `gmail_message_id + attachment_index`.
- `vercel.json` usa 11:00 y 23:00 UTC; son 08:00 y 20:00 solo durante horario de verano chileno. Corregir horario de invierno antes de habilitar SLA local permanente.

## Identidad de activos: regla de matching (verificado 2026-11-15)
- Comparar staging con `maintenance_canonical_assets_v1` (213 activos), no solamente `maintenance_assets` (7).
- Para cada fila, usar primero patente normalizada única o nombre normalizado único; crear `candidate_asset_id` sin cambiar `review_status=needs_review` ni `official_meter_written=false`.
- Las patentes/nombres únicos son candidatos, no autorización para actualizar lecturas oficiales.
- No unir por nombre cuando hay dos activos homónimos: `Generador Toyama 6,5 Kva` aparece al menos dos veces en el catálogo. Los generadores QAS 500 tienen variantes numeradas, no inferir por mina.
- Estado histórico inicial: 363 lecturas, 268 con candidato, 95 sin candidato. Estado verificado posterior: 339 con candidato y 24 sin candidato; consultar siempre conteos actuales en Supabase.
- Los 95 pendientes representan 36 etiquetas de equipo distintas, priorizar identidad por placa/serie, código centro de costo y faena; evitar fuzzy matching automático de activos de seguridad crítica.
- La cobertura de correo no es completa hasta que los adjuntos estén almacenados y las filas importadas a staging. No declarar producción actualizada por cambios en esta skill.

## Hidden identity columns in operational Excel (2026-11-15 evidence)
- Scan ALL workbook sheets and ALL columns, including columns beyond the visible operational summary (e.g. column T in `Reporte Diario`). Do not restrict extraction to the visible equipment label in column B.
- Verified in `Reporte_Diario_Mina_Don_Jaime_Automatico  14-11-2026.xlsx`: row 7 column T `135GENERADORATLASCOPCOQAS500VD2` resolves the Don Jaime QAS 500 to canonical QAS 500 VD (2); row 38 column T `9-9 Camión Mercedes Benz Aljibe- TYYC-15` resolves Mercedes Atego to the unique canonical plate TYYC-15.
- Match candidate only after checking the exact canonical identity, same mine, unique match and source provenance. Retain `needs_review`; do not change official meter or maintenance state.
- Recheck the same hidden identity mapping on subsequent reports. An equipment label alone is insufficient if identity conflicts across versions.
- If hidden column is absent or conflicts, mark `identity_blocked` and request source confirmation, rather than auto-promoting.

## Control de ambigüedad y protección de lecturas (2026-11-15)
- Revisar las hojas `Reporte Diario`, `Base Equipos` e `Historial Lecturas`, comparando nombres, fechas, estado y columnas ocultas. La presencia de una línea base no valida automáticamente el horómetro actual.
- San Pedro `Boomer S1D N°2`: horómetro defectuoso, lectura regresiva 1.944 h rechazada según nota de fuente. No asociar al Boomer S1D de Don Jaime ni al Epiroc 2019 sin serie o código inequívoco.
- Peumo `Generador Atlas Copco QAS 500`: el archivo protege explícitamente la última MP oficial 27.780 h. No sobreescribir por el valor reportado; tampoco inferir la unidad VD (1/2/3) desde la faena.
- Peumo `Compresor Atlas Copco G132 (1)`: línea base protegida; no modificar sin instrucción de Planificación.
- Don Jaime `Compresor XAMS 396 E`: falta evidencia que confirme correspondencia exacta con `Compresor Portátil Atlas Copco XAMS` del catálogo; no asociar por familia.
- En el reporte Don Jaime existe `Compresor Doosan XP825` con ubicación Don Jaime confirmada; un registro de San Pedro con el mismo modelo no debe heredarlo sin validar traslado o identidad.
- Las etiquetas ambiguas se registran con razón específica en `review_reason`; no se crean activos duplicados ni se promueven lecturas oficiales.
- La skill actualiza procedimiento en branch, NO ejecuta sincronización Gmail ni significa despliegue de cron. Requiere QA, release y comprobación del worker.

## Gate de conciliación WhatsApp → avisos de OT (2026-11-15)
- Auditar cobertura por **identidad de mensaje**, no por filas de actualización: ver `motil_whatsapp_ingestion_reconciliation_v1` (migración propuesta `20261115230000`). Cada mensaje tiene un solo estado principal; conservar `has_exception` independiente, pues hay registros simultáneamente operacionales y con excepción.
- Línea base verificada en producción: 1.907 mensajes, 103 mensajes representados en 155 actualizaciones, 231 excepciones; 218 de tipo `media_processing_issue`; 6 registros de excepción se superponen con mensajes representados. Estas cifras son una fotografía, **no** cobertura completa ni diagnóstico de pérdida.
- La cola `motil_whatsapp_media_recovery_queue_v1` es de recuperación candidata. Reintentar sólo tras verificar IDs del proveedor, almacenamiento y hash; no marcar recuperación por la sola presencia de un registro.
- Usar `motil_whatsapp_maintenance_notice_candidates_v1` para avisos **no canónicos**, sin crear OT ni cambiar KPIs. Los tres casos iniciales son molino 8x48 (04/11 y 05/11) y corte eléctrico de Planta (08/11). No deducir que molino 8x48 equivale a `MOL-001 Molino SAG 01`.
- Antes de proponer OT, buscar por texto, activo canónico, ventana temporal, eventos, evidencias y OT abiertas/cerradas. En lectura verificada: 73 OT, 1.154 eventos OT y 250 archivos de evidencia, **cero** coincidencias textuales para molino/descanso/Chilquinta/corte eléctrico. No significa que no existan trabajos, sólo que no hay vínculo verificable.
- Conservar la distinción `aviso → decisión del planificador → OT vinculada o registro sin OT`. No asignar responsables, prioridad, duración, causa raíz ni aprobación desde WhatsApp.
- Verificar migraciones propuestas con SQL, RLS de tenant, permisos, pruebas de idempotencia y QA preview exact-SHA antes de desplegar. La existencia de una vista en GitHub no demuestra que funcione en producción.
- Reconciliar clasificaciones 72/74 de mensajes ambiguos: las 74 entradas provienen de extractos de 450 caracteres, mientras la consulta SQL usó texto completo. Leer cuerpo íntegro, conversación y adjuntos antes de promoción.

## Política de multimedia como evidencia (instrucción operativa 2026-11-15)
- NO procesar ni aplicar OCR/visión a fotografías WhatsApp por defecto. Guardarlas como evidencia original (hash, storage path, fecha, grupo, remitente y message ID).
- Interpretar primero el `body` del **mismo mensaje**; preservar texto/caption y `quoted_message_id` si existe. No tratar una fotografía con texto asociado como mensaje sin información.
- Cuando no haya texto, dejar `media_evidence_only`, sin inventar contenido, sin generar tareas de escaneo y sin bloquear el resto de la ingesta.
- Videos también son evidencia por defecto. Procesarlos sólo con solicitud y justificación específica.
- La vista propuesta `motil_whatsapp_media_review_priorities_v1` debe reflejar `text_with_media_evidence` o `media_evidence_only`; nunca forzar OCR.
- Evidencia de lectura: entre 112 JPEG almacenados con `scan_status=manual`, 37 tienen `body` no vacío; este universo no equivale necesariamente a los 102 JPEG de la cola de excepciones.
