# Green API — configuración operacional de MOTIL

Última comprobación: 2026-10-15, aproximadamente 09:37 America/Santiago.
Este documento contiene identificadores y procedimientos, nunca secretos. Revalidar estado vivo antes de reutilizar.

## Configuración verificada para consultar grupos

- Proyecto Vercel: v0-erpminia (prj_EaDtlCXr00V6feocyDavSMsMXtaZ).
- GREENAPI_API_URL: https://7107.api.greenapi.com
- GREENAPI_ID_INSTANCE: 710722691570
- GREENAPI_API_TOKEN_INSTANCE: secreto guardado en Vercel, targets Production y Preview. Obtener de apiTokenInstance de esta misma instancia, sin copiarlo a documentación.
- GREENAPI_WEBHOOK_TOKEN: secreto del receptor MOTIL; distinto del token API. Conservar la correspondencia con el relay que entrega a MOTIL.
- CRON_SECRET: secreto separado para la tarea diaria.
- Consulta: GET /waInstance{idInstance}/getChats/{apiTokenInstance}, sin cuerpo.
- Estado: GET /waInstance{idInstance}/getStateInstance/{apiTokenInstance}, sin cuerpo.
- Corrección funcional y pruebas: SHA 6f8170414aefeefcba28f42cd2e6c6e6072bd1de, PR #518.
- Preview validado por el usuario: https://v0-erpminia-git-fix-greenapi-in-9269bf-travis-projects-c14a785a.vercel.app/dashboard/admin/whatsapp
- No equiparar configuración presente, build READY o listado de grupos exitoso con ingesta verificada.

## Selección persistida

Organización: 2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee.
Base: proyecto Supabase motil (ttlptyheuqeotadtcbaw).

| Grupo observado | chat_id | enabled |
| --- | --- | --- |
| Mantenimiento MOTIL la patagua | 120363427917216825@g.us | true |
| Planta Patagua | 120363403264951041@g.us | true |
| Programación Despacho Concentrado CMLP | 120363410025206469@g.us | true |

Las tres filas se crearon el 2026-10-15 entre 12:34:16 y 12:34:28 UTC. El nombre Mantenimiento MOTIL la patagua difiere del nombre Grupo 2 mencionado inicialmente; no asumir identidad entre nombres sin confirmar el ID. Preservar la selección realizada por el usuario.

## Recepción compartida

La URL observada anteriormente en Green API fue https://www.n3uralia.com/api/whatsapp/webhook. Revalidarla sin revelar los secretos de la consola. No sustituirla por MOTIL sin comprobar sus consumidores.

Receptor MOTIL: POST /api/integrations/greenapi/webhook.
Autenticación: Authorization: Bearer <GREENAPI_WEBHOOK_TOKEN> o x-greenapi-token.
Acepta incomingMessageReceived de la instancia configurada y grupos habilitados.
Comprobar que el receptor N3uralia realmente reenvía al destino MOTIL correcto, con autenticación y reintentos; la existencia de la URL por sí sola no prueba el relay.
No vaciar colas ni alterar el receptor compartido para probar.

## Verificación de ingesta pendiente

Consulta directa a motil_whatsapp_groups y motil_whatsapp_messages: tres grupos habilitados, cero mensajes guardados en cada uno al momento de comprobación. last_received_at y latest_stored_at nulos.
El handler inspeccionado no actualiza last_received_at explícitamente: usar filas de mensajes y max(received_at) como evidencia principal, sin depender sólo del campo del grupo.
No afirmar ingesta activa hasta encontrar un mensaje real persistido.

Prueba de cierre:
1. Recibir un mensaje real de otro participante en uno de los grupos seleccionados. El handler sólo acepta eventos incomingMessageReceived; los eventos de mensajes propios enviados desde teléfono/API no son equivalentes.
2. Correlacionar entrega Green API, receptor N3uralia, relay y respuesta MOTIL sin registrar secretos ni contenido innecesario.
3. Verificar organization_id, group_id, provider_message_id y received_at en la base; comprobar deduplicación ante reentrega.
4. Verificar rechazo de grupos deshabilitados y ausencia de cambios en OT/HSE.
5. Si no llega, revisar configuración del relay, autenticación, destino y protección del despliegue, antes de reemplazar credenciales.

## Resumen diario

Ruta /api/cron/whatsapp-daily; cron 30 9 * * * (09:30 UTC).
Día del informe: día local anterior America/Santiago.
Equivale a 06:30 o 05:30 local según horario de verano. Revisar despliegue productivo y ejecución real; un Preview no acredita ejecución del cron productivo.

## Diagnóstico y reutilización

Comparar contrato HTTP antes de atribuir un 401 a credenciales. Después de modificar variables, probar un despliegue creado después del cambio. Nunca extraer tokens de árboles de accesibilidad con regex ni asumir que un valor sensible oculto por un conector está vacío.
Usar el mismo hostname estable del Preview para evitar cambiar de sesión en cada build.
Mantener el PR en borrador mientras falten controles de ingesta y recuperación.

Fuentes oficiales:
- https://green-api.com/en/docs/api/service/GetChats/
- https://green-api.com/en/docs/api/account/GetStateInstance/
