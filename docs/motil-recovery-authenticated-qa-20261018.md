# MOTIL — QA autenticado previo al cambio de GitHub

**Estado: NO EJECUTADO.** Revisión humana autorizada y conectada requerida. No confundir build READY con QA PASS.

## Entorno exacto
- PR: https://github.com/juanvialcomber/v0-erpminia/pull/1
- Commit de referencia: `7d501f96b7ba9eca09b98f7ca8413cac884dfe8e`
- Preview: https://v0-erpminia-br1j-g1ocwyi41-travis-projects-c14a785a.vercel.app
- Supabase: `ttlptyheuqeotadtcbaw` (datos reales compartidos: prueba **solo lectura**).
- Nunca usar el Preview para crear OT, modificar inventario, subir archivos, ejecutar crons, simular despachos, emitir notificaciones ni modificar producción.

## Casos críticos (todos requieren evidencia PASS)

| Caso | Perfil | Acción segura | Evidencia de PASS |
| --- | --- | --- | --- |
| Sesión | admin | Iniciar y cerrar sesión en Preview; no cambiar datos | Sesión válida y redirección correcta, sin error middleware |
| Autorización | perfil operativo | Acceder a áreas permitidas y comprobar rechazo de un área restringida | Permisos server-side correctos |
| Mantenimiento | Ariel / Joaquín | Abrir listado, calendario y una OT histórica, **sin editar** | Estado, asignación, prioridad y fotos coherentes |
| Producción | usuario autorizado | Abrir actividad diaria y cifras existentes | Fuentes y fecha identificables, sin números inventados |
| Bodega | usuario autorizado | Consultar un SKU existente y su historial | Stock/costo/unidad coinciden con registro canónico |
| WhatsApp | admin | Abrir registro de grupos y actividad | Tres habilitados y uno excluido, contenido fuente visible |
| Evidencia | usuario autorizado | Abrir una imagen/documento histórico permitido | URL firmada o acceso autorizado sin exposición pública |
| Roles HSE/Legal/Finanzas | cada rol | Verificar visibilidad propia y denegaciones | Sin filtración entre áreas |
| Navegación | desktop/móvil | Abrir menús, lista, detalle y volver | Sin errores ni controles inaccesibles |

Para cada caso registrar fecha, SHA mostrado, usuario/rol, URL, captura (sin secretos) y resultado PASS/FAIL.

## Gate integraciones y reversión
- Siete crons protegidos con `MOTIL_CRON_EXECUTOR_ENABLED=true` **solo al activar un único ejecutor productivo**.
- Webhook entrante protegido con `MOTIL_GREENAPI_WEBHOOK_ENABLED=true` **solo tras mover el callback del proveedor**.
- Verificar que el grupo Mantenimiento MOTIL la patagua permanezca deshabilitado.
- Verificar último mensaje recibido antes del corte y el primero después, sin saltos o dobles entregas.
- Registrar deployment antiguo `dpl_77PXeZEgGHQsii3iqusfwc7XTqSj` / SHA `8d0d5169f5b2aaf0e0ac3d2e09908a1ed1791234`.
- Comprobar permisos reales de rollback antes del corte. Restaurar alias/código no equivale a revertir efectos externos ni escrituras SQL.
- Congelar merges no relacionados mientras se ejecuta el cambio.
- Sin QA completo, webhook verificado y reversión practicable: **HOLD**.

## Observación inicial de solo lectura
- 2026-10-18: CI del SHA indicado = SUCCESS; Vercel Preview = READY.
- En Supabase: tres grupos WhatsApp habilitados y uno deshabilitado.
- QA autenticado no realizado porque el navegador conectado no está disponible desde este contexto.
