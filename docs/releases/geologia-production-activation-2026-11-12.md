# Activacion MOTIL Geologia - 2026-11-12

## Alcance
Habilitar el trabajo profesional sobre Ficha 360 y registros geologicos formales del PR #313 para los usuarios existentes con permiso `prod_geologia`.

## Control de cambios
- Base: main, SHA `26849a6014b1e3590adb69f5354f771df20999d1`.
- Migracion: `20261112112000_production_geology_formal_logging.sql`, aplicada mediante la conexion de Supabase autorizada.
- Verificado antes de activar: las dos tablas existen, RLS activo, triggers de revision y auditoria habilitados, `anon` sin SELECT, `authenticated` sin INSERT, y `service_role` con INSERT.
- Corte de referencia: 400 sondajes, 38 intervalos de perforacion historicos, cero nuevos registros formales y cero eventos. No se transformaron los registros historicos.
- Vercel: `MOTIL_GEOLOGIA_360_ENABLED=true` y `NEXT_PUBLIC_MOTIL_GEOLOGIA_360_ENABLED=true`, solo en el entorno `production`.
- El conector Vercel devolvio 403 al intentar crear un deployment directamente; este commit documental activa el despliegue normal del repositorio conectado a `main`, sin cambiar codigo ni credenciales.

## Seguridades
- No se habilita aprobacion automatica, ley estimada, generacion de muestras ni edicion automatica de datos canonicos.
- Los borradores y la revision se someten a los permisos existentes; un autor no valida sus propios registros.
- La activacion se limita a Geologia y se revierte retirando ambas variables y desplegando de nuevo. La estructura de tablas se conserva, sin borrado.
- Durante el despliegue, verificar SHA exacto, estado READY y alias `motil.app`, pruebas, errores runtime y continuidad de conteos.

## QA pendiente
El usuario comunico que ya realizo una prueba satisfactoria. La comprobacion automatica del entorno no equivale a una sesion autenticada independiente. Dejar constancia del alcance y conservar verificaciones posteriores.
