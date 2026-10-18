# MOTIL — Puerta de traspaso de motil.app (2026-10-18)

**Estado: HOLD.** No modificar dominio, repositorio enlazado, procesos productivos ni Supabase hasta completar y comprobar los controles.

## Objetivo

Mantener el proyecto Vercel productivo original `v0-erpminia` (prj_EaDtlCXr00V6feocyDavSMsMXtaZ), reemplazando solamente su vínculo GitHub por `juanvialcomber/v0-erpminia` cuando el SHA objetivo esté verificado. Preservar Supabase `ttlptyheuqeotadtcbaw` y sus Storage buckets.

## Evidencia de revisión

- Rama de recuperación: `fix/recover-whatsapp-cron-20261018`.
- SHA comprobado por CI y Preview: `24c29108e2d1c24a8c8e35b150a9381cbced40f7`; GitHub Actions SUCCESS y Vercel Preview READY.
- La cuenta conectada todavía no puede leer `traviscomber/motil`. No es posible demostrar paridad completa de código.
- Browser conectado no disponible: QA autenticado de escritorio y móvil no ejecutado desde esta sesión.
- En proyecto original existen las variables Green API, CRON_SECRET, OpenAI, Blob, PostgreSQL, VAPID, etc. con targets productivos; en el proyecto Preview recuperado solo están cuatro variables Supabase para preview.
- No copiar ni revelar secretos. Priorizar reconectar el proyecto productivo existente preservando sus variables y dominio, no trasladar dominio a otro proyecto.

## Inventario de jobs declarado en vercel.json de la recuperación

| Ruta | Horario UTC (Vercel) | Riesgo duplicidad |
| --- | --- | --- |
| /api/cron/maintenance-analytics-daily | 01:00 diario | registros derivados |
| /api/cron/role-kpi-snapshots-daily | 06:30 diario | indicadores |
| /api/cron/whatsapp-daily | 09:30 diario | reportes |
| /api/cron/messages-push | cada minuto | avisos duplicados |
| /api/cron/whatsapp-history | :07 y :37 hora | ingesta repetida |
| /api/cron/whatsapp-media | cada 5 minutos, desplazamiento :01 | adjuntos duplicados |
| /api/cron/whatsapp-vision | cada minuto | trabajos / costos IA duplicados |

Vercel Preview no demuestra ejecución productiva de cron. La lista es de configuración de código, no de ejecuciones verificadas.

## Controles necesarios antes de reconectar GitHub

1. **Paridad funcional:** verificar rutas y flujos críticos (login, roles, OT, mantenimiento, producción, bodega, WhatsApp, archivos, agentes); realizar QA autenticado desktop y móvil en SHA exacto.
2. **Continuidad de datos:** comprobación contra Supabase común, Storage privado y conteos antes/después; nunca hacer copia masiva ni reconciliar por sobrescritura.
3. **Jobs:** inspeccionar cron efectivo de proyecto productivo y consumidores externos (Green API webhook, Supabase Edge, monitor de colas). Preparar idempotencia por source ID y locks; un solo ejecutor de cron por tarea.
4. **Configuración y secretos:** corroborar variables por entorno sin revelar valores; comprobar callback Green API, auth/sesión, llaves de servidores y notificaciones. No copiar secretos al proyecto Preview salvo necesidad puntual y autorizada.
5. **Prueba controlada:** generar un deployment Preview de GitHub aprobado enlazado al proyecto original si plataforma lo permite; no cambiar producción de forma accidental.
6. **Reversión:** documentar proyecto, commit y deployment productivo actual; verificar opción real de rollback previo al cambio y permisos para ejecutarlo; revertir código no revierte mutaciones de base ni envíos externos.
7. **Liberación:** cerrar diferencias, PR merge autorizado, revisión UI y runtime limpio; volver a solicitar autorización explícita del usuario para reconectar GitHub.
8. **Postcambio:** verificar SHA y dominio, acceso por roles, últimos mensajes y evidencias, un solo flujo de ingesta y avisos, errores runtime y salud del cron.

## Criterio final

PASS solo con evidencia de cada control. En cualquier incumplimiento, mantener HOLD y funcionamiento actual de `motil.app`. No interpretar build READY como equivalencia funcional o seguridad de corte.

## Confirmación de producción y reversión (18-10-2026)

Consulta de alias **motil.app** resolvió al deployment `dpl_77PXeZEgGHQsii3iqusfwc7XTqSj`, SHA `8d0d5169f5b2aaf0e0ac3d2e09908a1ed1791234`, rama `main`, repositorio `traviscomber/motil`, estado `READY`, target `production`; alias `motil.app` y `www.motil.app` confirmados. Proyecto original `prj_EaDtlCXr00V6feocyDavSMsMXtaZ`. Este es el candidato de rollback a conservar; **rollback no probado** y la existencia de un deployment no garantiza su restauración tras el cambio de repositorio. Antes del corte verificar permisos y compatibilidad del mecanismo de rollback sin ejecutarlo sobre producción.

La última rama recuperada `3ff12a3f82ccc52a191bd3fa86dd110f0a28fe75` debe superar CI y preview exactos además de QA autenticado. El navegador conectado no estuvo disponible desde esta sesión. **HOLD**.

## Control de ejecutor exclusivo en nueva versión

El commit `67c8e5c3894fc75432fd3c47787a0aed99e3aacf` agrega un opt-in estricto en los siete endpoints de cron. Requiere `MOTIL_CRON_EXECUTOR_ENABLED=true`; por defecto retorna 503 y no procesa. Se agregó `tests/cron-executor-handover-gate.test.mjs` con cobertura de los siete endpoints. **La protección está aún pendiente de CI y QA en el SHA exacto.**

Plan de corte seguro:
1. Confirmar disponibilidad y cron efectivo del sistema original antes del corte, además de snapshots y lag de las colas.
2. No habilitar la bandera del proyecto recuperado en Preview ni otro proyecto que comparte Supabase.
3. Reconciliar aplicación y entorno productivo original en una ventana de corte: identificar un único ejecutor para cada job; desligar el programador anterior antes de habilitar el nuevo; registrar hora de último éxito y primera ejecución.
4. Una vez validada la nueva aplicación y obtenido permiso de cambio de GitHub, activar la bandera en **solo el proyecto productivo elegido** durante el corte; verificar trabajo único por mensaje, aviso, día y empresa. La bandera no cubre webhooks entrantes ni workers ajenos a las siete rutas: inspeccionarlos aparte.
5. Si falla: deshabilitar el ejecutor nuevo antes de restaurar el anterior. Rollback del código por sí solo no deshace trabajos ya procesados.

**Advertencia de continuidad:** si la versión recuperada entra en producción sin la variable, estos siete jobs se detienen intencionalmente y retornan 503. La sincronización de datos seguiría existiendo, pero no habría actualización por cron hasta completar la habilitación. No declarar traspaso PASS sin prueba del primer ciclo.

## Verificación final sin cambios productivos (18-10-2026)

- HEAD anterior `b72787c9fc3f527a8a578794cbe7c70c53d10ad5`: GitHub Actions SUCCESS y Vercel Preview READY.
- Alias `motil.app`: confirmado por Vercel apuntando al despliegue original `dpl_77PXeZEgGHQsii3iqusfwc7XTqSj`, proyecto `prj_EaDtlCXr00V6feocyDavSMsMXtaZ`.
- Original conserva variables `GREENAPI_API_URL`, `GREENAPI_ID_INSTANCE`, `GREENAPI_WEBHOOK_TOKEN`, `GREENAPI_API_TOKEN_INSTANCE`, `CRON_SECRET` en sus targets declarados. Solo se inspeccionaron **nombres/targets**, no valores. Recuperación sin esas variables; permanecerá inerte para esos procesos.
- La API Vercel de la cuenta ofrece `request_rollback(projectId,deploymentId,...)` y `assign_alias`; la acción de rollback **no se ejecutó**. No se ha demostrado aún que restaurar el original después de cambiar la conexión Git sea aceptado por plataforma y mantenga configuración.
- La consola de Green API en Opera no devolvió contenido de configuración verificable; **callback efectivo aún no acreditado**. No modificar la URL ni el token desde una suposición.
- Para un corte seguro: mantener el proyecto Vercel original como destino, acreditar el rollback pre-corte sin ejecutarlo, conservar su deployment y configuración; inspeccionar callback actual en Green API; sincronizar último mensaje y colas; activar exactamente un receptor y un ejecutor. No habilitar los flags en dos despliegues simultáneos.
- QA funcional con Ariel, Joaquín, Daniel y Elías fue confirmado por el usuario en Opera, sin constituir prueba automatizada de aislamiento RBAC.

**Gate actual: HOLD** por callback Green API no verificado, reversión no practicada y ausencia de aprobación expresa del cambio productivo. No se cambió alias, repositorio, base ni workers.
