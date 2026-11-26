# Vales Bodega · candidato 26/11

Solicitud explícita: priorizar vales y dar acceso temporal a todos los participantes de la reunión. Desarrollado en rama; ninguna migración, permiso o stock productivo modificado.

## Reutilización

Maestro `canonical.products`, perfiles, OT `maintenance_work_orders`, stock `warehouse_stock` y movimientos `stock_movements`. No usar el QR de posición para autorizar consumo; nuevo proceso de vale con líneas, decisiones y eventos propios. Conteos/revisiones existentes se referencian, no se copian. La aprobación de conteo NO activa inventario: hace falta activación explícita por posición y `deliveries_enabled`.

El piloto se habilita con `MOTIL_WAREHOUSE_VOUCHERS_ENABLED=true` exclusivamente en la aplicación de QA y `warehouse_voucher_settings.enabled=true` por organización en su BD aislada. Ambas puertas están cerradas por defecto. No copiar la configuración de QA a producción.

## Acceso nominal

Invitación de Constanza del 24/11 para reunión 26/11: Juan, Constanza, Ariel, Bred Cruz, Cristian Vidal, Daniel, Pedro. Esteban participa según notas tl;dv. La invitación acredita invitados, no presencia efectiva de cada uno.

Consulta read-only de perfiles: Juan, Ariel, Cristian, Daniel, Pedro y Esteban tienen perfiles activos de la misma organización. No se encontraron perfiles de Constanza ni Bred por email exacto/nombre; no crear identidad ni dar permisos a coincidencias aproximadas. Alta/autenticación de ambos pendiente.

Preparar accesos nominales en QA con vencimiento 01/01/2027: los seis perfiles encontrados pueden solicitar; sólo Esteban aprueba/entrega. Todos ven sus vales; el encargado ve la bandeja. No otorgar ED de inventario a todos ni alterar la matriz global por cargo. Si Esteban solicita, no puede autoaprobar: necesita un suplente que todavía no está definido. No se concede ese permiso a Juan por ser administrador.

No se incluye lista privada de UUID/email como seed automático en migración pública. Configurar la lista resuelta mediante sesión administrativa de QA, verificando tenant y perfil activo; el SQL productivo no se ejecuta en este trabajo.

## Flujo

Solicitar OT + bodega Central + receptor + motivo + hasta 15 materiales/unidades del catálogo. Cantidad decimal exacta. Identidad solicitante se toma de sesión. Esteban decide con motivo; sólo aprobados y vigentes emiten QR. QR local a MOTIL, sin datos personales ni secretos; requiere login y permiso vigente. Escanear no descuenta. Entrega confirma receptor físico y cantidad; evento, movimiento y saldo en una transacción con bloqueos. Parcial mantiene saldo pendiente. Reintento idéntico único, cambio de contenido con la misma clave rechazado. Rechazo/cancelación sin descuento.

Fin de semana: solicitudes se pueden preparar; aprobar/entregar queda bloqueado hasta definir la política. No se habilita bypass automático. El 1 de enero exige cobertura específica acordada antes de salida.

## Límites y gates

Stock productivo verificado sigue entero. Se aceptan solicitudes decimales, pero la entrega fraccionaria se bloquea explícitamente hasta integrar y validar la migración decimal existente (candidata 05); no redondear ni duplicar ese desarrollo. La ruta nueva no reserva stock: la aprobación es intención, no garantía de disponibilidad. La entrega revalida disponible descontando reservas existentes y no consume reservas de otra OT.

HOLD: migración representativa, revisión independiente, preview READY y QA autenticado en Opera de usuarios autorizados/denegados. El guard global incorpora acceso nominal exclusivamente a la página y las dos rutas API de vales, incluyendo Finanzas; no abre otras rutas de Bodega. Aplicación de permisos en QA y dos altas pendientes; apertura de stock, decimal y autorización de fin de semana; autorización explícita de producción e inventarios antes de merge/release.

## Verificación ejecutada

- 12 pruebas PASS del contrato y SQL real de esta migración sobre PostgreSQL embebido (PGlite), esquema sintético explícito; no equivale a un clon de producción.
- 23 regresiones existentes PASS de escrituras inseguras, navegación Bodega y límites de Finanzas.
- QR SVG generado localmente, sin proveedor externo. Falta escaneo físico y QA autenticado.
- Las pruebas con dos vales se ejecutaron secuencialmente sobre el último saldo; prueban agotamiento y preservación de reservas, no contención entre dos conexiones reales. Concurrencia real sigue pendiente.
- 431 versiones de migración únicas. La migración nueva no contiene seeds ni altera tipos/saldos existentes.
- Build completo PASS con NODE_OPTIONS=--max-old-space-size=6656, incluido TypeScript y postbuild: 2.774 pruebas PASS, cero fallos. El primer intento agotó el heap estándar; no se desactivó la comprobación de tipos. El import inicial del guard rompía una prueba del cron meteorológico; se corrigió y la suite completa volvió a pasar.
- `scripts/configure-warehouse-voucher-qa.mjs` prepara acceso nominal desde JSON privado por stdin, en base dedicada cuyo nombre contiene QA. Modo seco por defecto; rechaza el host productivo conocido y no crea cuentas. Si falta una identidad, revierte todo. No se ejecutó contra una BD compartida o producción.

## Estado de entrega

Desarrollo y corrección final guardados en commits locales. El primer intento de publicar fue rechazado por revisión automática. Travis autorizó expresamente publicar la rama y continuar con las pruebas el 26/11. La publicación no autoriza merge, producción ni inventarios. Preview y QA autenticado siguen pendientes. Los accesos nominales están preparados mediante el configurador QA, pero no aplicados en un entorno compartido. La publicación de la rama está autorizada; la instalación aislada requiere verificar el entorno y sus accesos antes de operar.
