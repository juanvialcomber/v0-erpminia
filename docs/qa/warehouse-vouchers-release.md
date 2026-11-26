# Vales de consumo · habilitación en MOTIL

Travis autorizó el 26/11 incorporar directamente la sección en producción y hacer merge del PR #349. La ruta es `/dashboard/bodega/vales`, accesible desde Bodega y mediante acceso nominal en el menú principal.

La autorización del módulo se gestiona dentro de MOTIL por organización/perfil, sin depender de una variable externa de piloto. Se conserva el permiso individual y su vencimiento; no se otorga edición general de inventario.

## Base de datos

Migración `20261126143303_warehouse_consumption_vouchers.sql` aplicada en Supabase MOTIL; versión del repositorio conciliada con `schema_migrations`. Agrega tablas de vales/líneas/eventos/configuración/acceso y función transaccional, con RLS y ejecución exclusiva de servicio autenticado. No crea saldos de apertura ni modifica existencias.

Configuración de La Patagua: solicitudes/aprobaciones habilitadas; entregas de inventario y autorización de fin de semana deshabilitadas. El descuento exige apertura explícita por posición y autorización de entrega, por separado. No se ejecutaron movimientos de stock.

Acceso nominal temporal hasta el 31/12/2026 para Juan, Ariel, Daniel, Pedro, Esteban y Cristian Vidal. Todos pueden solicitar; sólo Esteban aprueba/rechaza y tiene capacidad de entrega, actualmente bloqueada por configuración de inventario. No puede autoaprobar su solicitud. Constanza Roco y Bred Cruz siguen pendientes porque no tienen perfil canónico activo; no se inventó cargo ni credencial.

## Flujo y reutilización

Reutiliza perfiles, catálogo canónico, OT, conteos, stock y movimientos existentes. Solicitud con receptor, OT, motivo y hasta 15 líneas; cantidades exactas. Bodega decide con motivo. QR de vale aprobado/vigente abre una página autenticada; escanear no descuenta. La entrega física confirmada realiza movimiento, saldo y evento en una transacción. Reintentos idénticos no duplican consumo. Reservas ajenas se preservan.

El identificador de perfil queda en la auditoría del vale. `stock_movements.performed_by` utiliza la identidad de `auth.users` resuelta mediante el vínculo canónico existente; no se confunden ambos UUID. Entregas fraccionarias siguen bloqueadas mientras el stock operativo utilice enteros, sin redondeo.

## Verificación

Build y TypeScript aprobados con heap de 6656 MB. Suite completa aprobada; 13 escenarios SQL/contrato de vales incluyendo identidades distintas, 23 regresiones de límites y escritura verificadas en el bloque previo. Las pruebas PostgreSQL embebidas usan esquema sintético; la contención entre dos conexiones reales y el recorrido humano con cámara permanecen pendientes. No se fabrican solicitudes de prueba en producción.

El correo GitHub consultado se refiere a fallos de otros cambios del 25/11, no al PR #349. Registrar el deployment/SHA final y su estado antes de declarar la sección disponible. La API Vercel devolvió 403 para crear previews; el merge autorizado utiliza la integración Git existente para producción, sin alterar settings de acceso de Vercel.
