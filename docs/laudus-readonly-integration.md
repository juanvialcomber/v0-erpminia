# Laudus → MOTIL: implementación inicial de lectura

Estado: base verificable, integración pendiente. No hay conexión autenticada demostrada, rutas públicas nuevas, cron activo, cambios de permisos ni escritura en Laudus.

## Evidencia consultada el 22 de octubre de 2026

- https://laudus.cl/ayuda/api/: login POST /security/login con companyVATId, userName, password; token y expiration; listados POST con fields, filterBy, orderBy, options.limit/offset; respuestas 204 y 206.
- La documentación asume America/Santiago para fechas sin zona. Antes de activar, cada contrato debe definir conversión del reloj UTC a la fecha local esperada por ese endpoint, incluyendo DST. El núcleo actual usa ISO UTC y NO debe activarse sin resolver este contrato.
- Confirmación comercial proporcionada por Juan: API habilitada; 2.000 llamadas gratuitas mensuales; no autoriza sobrepasar dicho límite.
- Repo autorizado identificado por README: juanvialcomber/v0-erpminia (MOTIL).
- No había código con referencia a Laudus en el checkout revisado.

## Entregado

`lib/integrations/laudus/readonly-sync.mjs` es un núcleo sin activación automática. Admite proveedores, compras, inventario y finanzas con correspondencia a fin_compras, bodega_inventario y fin_finanzas. No inserta directamente en tablas canónicas ni modifica autorizaciones. Sólo hace POST al login y al listado exacto del contrato verificado; host fijo, redirects bloqueados, timeout, errores sin cuerpos ni secretos, sin reintentos automáticos.

Seis pruebas ejecutables usan datos sintéticos y transporte simulado. No constituyen validación de Laudus real.

## Requisitos antes de habilitar

1. Obtener el OpenAPI oficial y certificar para cada dominio: ruta de listado, campos mínimos, clave estable (incluyendo claves compuestas cuando corresponda), fecha de modificación, semántica de borrados y disponibilidad de filtros. No asumir que todos los recursos tienen modifiedDate; si no existe, diseñar refresco completo acotado y no fingir incrementalidad. Inventario requiere stock por bodega además de catálogo.
2. Implementar store duradero sobre la infraestructura vigente. withLock debe serializar por organización/empresa con lease; reserveCall debe ser atómico y negar consumo si falta baseline mensual verificado desde Ayuda > Uso de la API. Contar login, errores y todos los consumidores de la misma empresa; reservar margen para terceros. El límite local por sí solo no garantiza gratuidad si otros sistemas consumen la API.
3. commitPage debe guardar evidencia y checkpoint en una transacción, con upsert por organización/dominio/clave, sin sobrescribir evidencia Excel canónica. Versionar contratos, resolver deduplicación y conciliación antes de promover registros a los módulos.
4. Reusar sesión entre procesos mediante almacenamiento de secretos protegido o un worker único; el núcleo sólo la reutiliza en una instancia. No guardar tokens en tablas accesibles a usuarios.
5. Configurar usuario técnico con permisos de lectura en Laudus y secretos server-side, ligados a una organización y RUT exactos. Nunca NEXT_PUBLIC_*. No introducir contraseñas en repositorio, logs, respuestas, fixtures o documentación.
6. Añadir lecturas de evidencia bajo requireModuleAccess y getOrganizationContext existentes; aplicar filtro de organización en todas las consultas y separar finanzas de bodega/compras. No exponer el núcleo como proxy genérico ni aceptar contratos del navegador.
7. Validar fechas locales, ventanas estables y consistencia de offset ante modificaciones concurrentes. Si la API no garantiza snapshot, usar paginación por clave estable o reconciliación acotada; no declarar integridad sólo por terminar un recorrido.
8. Pruebas de store: concurrencia, fallo transaccional, cambio de mes, baseline desconocido, 1.999/2.000, reanudación, aislamiento entre organizaciones, errores 401/403/429/5xx, 204/206 y secretos. Revisar permisos con cuentas de cada módulo.
9. Preview y comprobaciones del SHA antes de merge. Primera prueba real mínima sólo después de confirmar credenciales y presupuesto restante. Mantener cron apagado hasta reconciliar resultados.

## Validación realizada

`node --test tests/laudus-readonly-sync.test.mjs`: 6/6. No se ejecutó build completo ni QA de producción. No se consultó consumo mensual real ni se inspeccionaron secretos de despliegue. No se desplegó ni migró base de datos.


## Prueba real posterior — 22 de octubre, America/Santiago

Juan confirmó usuario con permisos de sólo lectura y llamadas gratuitas disponibles. Se hicieron dos autenticaciones POST /security/login, ambas HTTP 200 (la primera prueba no conservó el token; la segunda se reutilizó para el listado). Una consulta POST /purchases/suppliers/list, limit=5, offset=0, fields supplierId/name/modifiedAt, orderBy supplierId ASC respondió HTTP 200 y cinco registros con esos campos. Total de solicitudes autenticadas enviadas: 3. No se imprimieron ni persistieron tokens, contraseñas o valores de proveedores. No se escribió en Laudus ni en base de datos MOTIL.

OpenAPI oficial accesible en https://api.laudus.cl/swagger/v2/swagger.json. SupplierDto confirma supplierId y modifiedAt. También se identificaron /purchases/orders/list, /purchases/invoices/list y /purchases/payments/list; inventario dispone de /production/products/stock y /production/products/stockByWarehouses. Estos últimos no se consultaron autenticados y requieren revisar sus parámetros antes de implementación.

Esta evidencia reemplaza únicamente el estado anterior de conexión no demostrada: autenticación y lectura pequeña sí están demostradas desde el entorno de desarrollo. Persistencia, sincronización desplegada, configuración de secretos en Vercel y permisos de lectura de cada módulo siguen pendientes. No afirmar integración productiva.


## Control de consumo reforzado

Tope preventivo del conector: 1.800 llamadas/mes, configurable sólo hacia abajo. No implica 200 llamadas garantizadas para terceros: el store debe conciliar consumo real compartido por RUT y negar reservas sin baseline. Cada ejecución admite por defecto seis llamadas, incluyendo autenticación; pausa conservando checkpoint al agotarlas. No hay reintento automático. El resultado devuelve calls.

readSession/writeSession/clearSession permiten reutilizar token entre instancias dentro del lock; requieren store protegido y duradero, aún pendiente. Token válido se reutiliza hasta un minuto antes del vencimiento. Un 401/403 invalida la sesión sin repetir la consulta. Caché configurable entre cinco minutos y un día. pageSize sólo puede superar 100 cuando el contrato certifique maxPageSize; menos campos reduce bytes, no necesariamente llamadas. Priorizar listados masivos y deltas; las pantallas deben leer el espejo local, nunca Laudus directamente.

Validación actual: 10/10 pruebas, incluyendo sesión compartida, presupuesto por ejecución y límites de página/mes. Sin nuevas llamadas reales durante este refuerzo. No activar cron hasta tener contador atómico y sesión persistente implementados.


## Persistencia y proveedores — 23 de octubre de 2026

Esquema productivo leído por MCP, sin escrituras: canonical_suppliers_v1 tiene organization_id, tax_id y procedencia Excel (source_file/source_sheet/source_row/source_payload). No se encontraron tablas laudus. Se implementó createPostgresStore: advisory lock por RUT, reserva mensual atómica conservadora, sesión AES-256-GCM ligada a organización/RUT y evidencia+checkpoint transaccionales en esquema privado. SQL en database/proposals es una propuesta no aplicada, no una migración. Requiere conexión directa o session pooling, jamás transaction pooling, clave de cifrado server-side de 32 bytes y baseline mensual reciente verificado. No guarda contraseña en DB.

Contrato inicial de proveedores y carga acotada a cinco páginas/100 filas, máximo seis llamadas, caché una hora. Conciliador puro valida dígito verificador y señala matched/new/invalid_rut/duplicate_source/ambiguous, sin mutar proveedores canónicos. Los importes y estados financieros no se promueven automáticamente.

Filtros de fecha ahora se expresan en hora local Santiago; pruebas verano/invierno. Pendiente verificar consistencia de snapshot y cambios en el retroceso DST antes de activar incremental productivo. Pruebas: 15/15, locales y transporte simulado. PostgreSQL aún NO probado en instancia aislada: pendiente SQL, locks entre procesos, rollback y permisos reales. No se ejecutó carga de proveedores ni nuevas llamadas a Laudus en este bloque. No hay despliegue ni cron.


## QA aislado ejecutado — 23 de octubre

16/16 pruebas unitarias aprobadas. Además se ejecutó tests/laudus-postgres.integration.mjs con PostgreSQL embebido PGlite instalado sólo en scratch: esquema real SQL, baseline desconocido bloqueado, reserva 1799→1800 y siguiente negada, token cifrado persistido y recuperado, upsert idempotente, rollback de evidencia y checkpoint al fallar, rechazo de scope ajeno, y falta de USAGE para authenticated. Resultado 1/1 aprobado. No hay dependencia nueva productiva.

La exclusión de dos invocaciones sobre un store se probó con conexión simulada. PGlite no prueba dos sesiones PostgreSQL independientes ni comportamiento del pool de despliegue; ese gate permanece abierto. No se aplicó SQL en Supabase ni se configuraron credenciales/clave ni se realizó carga real. La afirmación de disponibilidad gratuita no aporta el consumo exacto: se requiere baseline con contador del proveedor antes de habilitar reserveCall. No se inventó dicho valor. Cero nuevas llamadas a Laudus.

Reproducir: instalar @electric-sql/pglite en un directorio temporal y ejecutar LAUDUS_PGLITE_MODULE=/ruta/node_modules/@electric-sql/pglite/dist/index.js node --test tests/laudus-postgres.integration.mjs. Sin variable, la prueba se marca skip explícitamente.
