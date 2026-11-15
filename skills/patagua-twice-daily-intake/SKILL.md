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
