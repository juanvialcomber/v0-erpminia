---
name: greenapi-motil-ingestion
description: Diagnosticar, recuperar, validar y operar la recepción de mensajes Green API hacia MOTIL, incluyendo webhooks, grupos habilitados, deduplicación, Supabase, cron diario y QA de producción. Usar cuando la ingesta está en cero, aparecen HTTP 401/403, no llegan mensajes o se requieren reportes de grupos mineros.
---

# Green API · MOTIL

1. Descubrir repo, SHA productivo, deployment y tablas actuales; nunca asumir credenciales ni dar por correcto un 200.
2. Inspeccionar `app/api/integrations/greenapi/webhook/route.ts`, `lib/messages/greenapi.ts`, `app/api/admin/whatsapp/route.ts`, `vercel.json` y tests vigentes.
3. Green API debe enviar `incomingMessageReceived` al endpoint HTTPS público exacto `/api/integrations/greenapi/webhook`. El receptor exige `Authorization: Bearer <GREENAPI_WEBHOOK_TOKEN>` o `x-greenapi-token`; el token secreto no es el token de instancia. Comprobar mecanismo soportado por Green API sin exponer secretos. Si el proveedor no permite la cabecera requerida, usar adaptador firmado o mecanismo seguro revisado; nunca hacer público el receptor sin autenticación.
4. Verificar `GREENAPI_ID_INSTANCE`, `GREENAPI_API_TOKEN_INSTANCE`, `GREENAPI_WEBHOOK_TOKEN`, `GREENAPI_API_URL` y `CRON_SECRET` por presencia/alcance del entorno, nunca imprimir valores.
5. Obtener estado Green API, webhook configurado y tipo de notificaciones mediante endpoints documentados con solicitudes acotadas; nunca cambiar la instancia a ciegas.
6. Consultar `motil_whatsapp_groups` (enabled y last_received_at), `motil_whatsapp_messages` (conteo, frescura, ID proveedor) y `motil_whatsapp_daily_reports`; distinguir recepción, persistencia y clasificación.
7. Probar un mensaje real en un grupo habilitado con consentimiento, comprobar payload, match `instanceData.idInstance`, `senderData.chatId`, `idMessage`, `timestamp`, insert y heartbeat. No guardar mensajes de grupos no autorizados ni duplicar por retries. Mantener `group_id,provider_message_id` como identidad de deduplicación.
8. Siempre priorizar ingesta pasiva: cron protegido /api/cron/whatsapp-history cada 30 minutos (07 y 37 UTC) para recuperar los 100 últimos mensajes entrantes disponibles por grupo habilitado; nunca enviar mensajes de prueba ni cambiar el webhook compartido. Verificar corrección de producción con recuentos reales en Supabase y registrar límites del historial.\n9. Un 401 puede ser cabecera/token, un 403 instancia, un 200 con skipped indica filtrado y un 503 puede indicar DB; inspeccionar respuesta, logs acotados y estado DB antes de cambiar seguridad.
10. Verificar el cron diario y zona `America/Santiago`. No crear hallazgos canónicos desde WhatsApp: conservar evidencia, IDs fuente y revisión humana.
11. Implementar branch-first, tests/CI/preview, QA autenticado y release exact-SHA. Sin confirmación de ingesta real, reportar HOLD y el punto de fallo observado.

## Referencias del caso de octubre 2026

Repositorio: `traviscomber/motil`; Supabase: `ttlptyheuqeotadtcbaw`; proyecto Vercel `prj_EaDtlCXr00V6feocyDavSMsMXtaZ`. El 15-10-2026 había tres grupos habilitados, cero mensajes y cero reportes. No usar esta observación histórica como estado actual.
