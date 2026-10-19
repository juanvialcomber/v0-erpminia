# MOTIL / Green API — recuperación del 19-10-2026

## Incidente y causa
Tras recuperar el repositorio hacia `juanvialcomber/v0-erpminia`, la rama `main` tenía `vercel.json` sin la propiedad `crons` (solo `buildCommand`). El endpoint de recuperación `/api/cron/whatsapp-history` existía y las variables `CRON_SECRET`, `GREENAPI_ID_INSTANCE` y `GREENAPI_API_TOKEN_INSTANCE` estaban configuradas en producción, pero la programación automática no se desplegaba. El último ingreso persistido anterior fue el 18-10-2026 a las 16:07 UTC.

## Corrección
PR #7, fusionado en `main` con SHA `c23acaa60b6ce6ce38c4b7a109c451c6701dd0c9`. Se restauraron los siete cron canónicos en `vercel.json`: analytics 01:00 UTC; KPI 06:30; resumen WhatsApp 09:30; push cada minuto; historial WhatsApp :07 y :37; media cada cinco minutos desplazado un minuto; visión cada minuto. No se modificaron handlers, secretos ni esquema de base de datos.

## Evidencia post-release
- Vercel `motil.app` READY en SHA `c23acaa6`.
- Conteo `public.motil_whatsapp_messages`: **272 → 330**; último registro 19-10-2026 14:07:21 UTC.
- Nuevos mensajes: Planta Patagua 48, Grupo 2 5, Despacho Concentrado 5.
- Duplicados agrupando por `group_id, provider_message_id`: **0**.
- Adjuntos en ese momento: 188 `stored`, 44 `pending`, 2 `unsupported`.
- Grupo Mantenimiento MOTIL la patagua permaneció excluido (no reactivar).
- Logs de Vercel no devolvieron mensajes en ventana de observación; **la evidencia fuerte es el incremento de la tabla**, no una ejecución HTTP individual confirmada.

## Runbook preventivo
1. En migraciones/repos nuevos, comparar `vercel.json` de la rama que realmente alimenta producción; verificar que contenga **los siete jobs**. La existencia del endpoint no implica ejecución.
2. Revisar las variables por **target production**, sin imprimir valores sensibles: `CRON_SECRET`, `GREENAPI_ID_INSTANCE`, `GREENAPI_API_TOKEN_INSTANCE`, `GREENAPI_API_URL`.
3. Comprobar que hay un único ejecutor productivo. No activar cron ni webhook en Preview contra la misma instancia/base; no duplicar programadores.
4. Respetar Green API: historial limitado a 100 entradas por grupo/consulta; grupos habilitados <=4, retraso >=1.35 s entre consultas; un retry acotado ante 429.
5. Mantener idempotencia mediante `(group_id,provider_message_id)`, revalidar grupos habilitados, y preservar `organization_id`.
6. Antes: snapshot read-only de totales, último `received_at`, recuentos por grupo, duplicados y adjuntos. Después de desplegar: esperar una ejecución a :07 o :37; volver a consultar; validar subida y diferencia por grupo. Que el total no aumente **puede** significar ausencia de mensajes nuevos: examinar logs y respuesta del cron antes de diagnosticar fallo.
7. Si se pierden días con alto volumen, `getChatHistory(count=100)` **no garantiza** recuperar todo el período; medir cobertura, no declarar completitud.
8. Verificar cola multimedia (`pending` → `stored`), sin suponer que fotos y videos pendientes fueron procesados.
9. Mantener el webhook externo de `n3uralia.com` separado de la recuperación de historial y revisar el reenvío; no modificarlo durante la reparación sin evidencia.
10. No mezclar cambios de presentación, RBAC, esquema, cron y proveedores en el mismo PR.
11. Gate de publicación: branch → Preview READY → tests/CI → diff → autorización → merge SHA exacto → `motil.app` READY → conteos y evidencia de runtime.
12. Si falta observabilidad (logs retenidos / ausentes), registrar HOLD para la comprobación específica; no suplantar con suposiciones.

## Referencias
- [PR #7](https://github.com/juanvialcomber/v0-erpminia/pull/7)
- [Repositorio MOTIL](https://github.com/juanvialcomber/v0-erpminia)
