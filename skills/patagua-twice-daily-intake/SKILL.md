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
- Estado de reconciliación: 363 lecturas, 268 con candidato, 95 sin candidato (Raíz del Cobre 30, San Pedro 23, Don Jaime 21, Peumo 21).
- Los 95 pendientes representan 36 etiquetas de equipo distintas, priorizar identidad por placa/serie, código centro de costo y faena; evitar fuzzy matching automático de activos de seguridad crítica.
- La cobertura de correo no es completa hasta que los adjuntos estén almacenados y las filas importadas a staging. No declarar producción actualizada por cambios en esta skill.

## Hidden identity columns in operational Excel (2026-11-15 evidence)
- Scan ALL workbook sheets and ALL columns, including columns beyond the visible operational summary (e.g. column T in `Reporte Diario`). Do not restrict extraction to the visible equipment label in column B.
- Verified in `Reporte_Diario_Mina_Don_Jaime_Automatico  14-11-2026.xlsx`: row 7 column T `135GENERADORATLASCOPCOQAS500VD2` resolves the Don Jaime QAS 500 to canonical QAS 500 VD (2); row 38 column T `9-9 Camión Mercedes Benz Aljibe- TYYC-15` resolves Mercedes Atego to the unique canonical plate TYYC-15.
- Match candidate only after checking the exact canonical identity, same mine, unique match and source provenance. Retain `needs_review`; do not change official meter or maintenance state.
- Recheck the same hidden identity mapping on subsequent reports. An equipment label alone is insufficient if identity conflicts across versions.
- If hidden column is absent or conflicts, mark `identity_blocked` and request source confirmation, rather than auto-promoting.
