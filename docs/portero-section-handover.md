# Portero: handover por sección

Cerrar procesamiento automático y conservar revisión humana son decisiones
distintas. La ingesta no aprueba lecturas, cambios de mantenimiento, producción,
stock ni hechos financieros. El mismo lote evaluado sin novedades no genera
otro traspaso, descarga ni OCR.

## Distribución

| Sección | Responsable de revisión | Alcance |
| --- | --- | --- |
| Mantenimiento / Fuentes | Planificación de Mantenimiento | Reportes, fechas, identidad de equipos, lecturas y líneas base MP |
| Producción / Fuentes | Ingeniería y Planificación | Estadísticas, stock mineral, cobertura por hoja y novedades de planta |
| Finanzas / Fuentes | Finanzas | Modelos de depreciación, inventario asegurado y conciliación previa al ERP |
| HSE / Sostenibilidad | Responsable HSE vigente | Novedades de seguridad con evidencia; bloquear si no hay persona verificada |
| Estado del sistema | Administración / Portero-Cronos | Orígenes faltantes, fallos agotados y restricciones técnicas |

Un aviso de trabajos en chancadores, molinos, filtros y procesos de planta se
deriva a Producción aunque un clasificador histórico lo haya llamado
`maintenance`. Conservar esa clasificación original y las referencias: el
traspaso es una propuesta para validar, nunca una corrección canónica ni una OT.
Stock mineral pertenece a Producción, distinto de inventario de materiales.

## Ledger existente, sin otra tabla o scheduler

- Correo: `motil_email_source_manifest.source_profile.portero`.
- Descargas WhatsApp: `motil_whatsapp_attachments.extraction_json.portero`.
- Resúmenes WhatsApp: `motil_whatsapp_daily_reports.findings[].portero`.

Cada entrada lleva identidad, versión, sección, responsable, estado, alcance,
limitación de cobertura, acción siguiente, condición de reapertura y fingerprint.
Actualizar solo el campo `portero` y preservar el resto de la evidencia.
Preparación del traspaso no equivale a recepción de la persona: mantener
`receipt_status=not_acknowledged` hasta una acción verificable. No marcar
notificaciones enviadas sin entrega real; este mecanismo no envía mensajes.

El helper `lib/intake/portero.mjs` devuelve `changed=false` con una entrada
idéntica y conserva su timestamp. Una nueva versión cambia la huella y enlaza
la anterior. No incluir en esa huella la hora de observación ni la edad creciente
por sí sola. Preservar checkpoints de canal separados: un lote registrado no
demuestra cobertura de fuentes que no pudieron consultarse.

## Cierre sin falsa aprobación

`human_review` y `blocked` salen del trabajo automático ejecutable. Los bloqueos
siguen contando como excepciones sin resolver, con dueño. `retry_scheduled`
sigue siendo trabajo automático abierto, aunque no venza todavía. Un estado
desconocido nunca permite declarar la cola vacía.

Sin conciliación de cobertura por hoja, registrar bloqueo explícito; no convertir
un perfil completo del libro ni su row_count en prueba de normalización total.
La revisión humana conserva sus estados de origen sin aprobar por silencio.

## Lectura por área

`GET /api/intake/handovers?section=maintenance|production|finance|hse|data_health`
requiere organización autenticada y permiso del módulo correspondiente. Los
bloqueos técnicos se restringen a administradores. Proyectar solo metadata de
traspaso; no transportar OCR, cuerpo del correo o perfiles de todas las hojas.
Revalidar organización y grupos habilitados al exponer hallazgos de WhatsApp.
Las vistas son acotadas y advierten truncación; el resumen describe únicamente
los traspasos mostrados, nunca la cobertura global.

El vigilante existente ejecuta Portero/Ingestor sin otro proceso repetitivo.
Comparar metadata y último resultado persistido; informar solo novedades,
resoluciones o escalaciones de SLA acordadas. La falta de ledger fiable requiere
inventario inicial honesto, no supresión silenciosa de incidentes nuevos.

## Validación

Probar segunda evaluación idéntica, nueva versión, retry futuro/vencido, fuente
sin original, permiso denegado, aislamiento de organización/sección, exclusión
de grupos deshabilitados y fallo de base distinto de cola vacía. Verificar con
lectura posterior que los metadatos se guardaron sin cambiar aprobaciones ni
las evidencias de origen.
