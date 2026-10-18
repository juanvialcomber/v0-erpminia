# MOTIL — Inventario previo a sincronización (2026-10-18)

## Identidades verificadas

- Vercel original: `v0-erpminia` / `prj_EaDtlCXr00V6feocyDavSMsMXtaZ`, enlazado a `traviscomber/motil`.
- Vercel recuperado: `v0-erpminia-br1j` / `prj_DJuG2OWmcMpC4jHWNhCV5MX4TMcW`, enlazado a `juanvialcomber/v0-erpminia`.
- Supabase canónico único: `ttlptyheuqeotadtcbaw`; la URL del proyecto original coincide con ese ref; la recuperación usa el mismo ref.
- El repositorio histórico `traviscomber/motil` devolvió 404 a la cuenta GitHub conectada: su HEAD, commits y cambios posteriores no están auditados. Las versiones Vercel antiguas sí conservan metadatos de SHAs.

## Estado de datos (solo lectura, cifras aproximadas de pg_class)

- Tablas `public`: 317; vistas `public`: 264.
- `production_material_movements` ~35.744; `production_plant_shifts` ~11.195; `production_metallurgy_results` ~11.184.
- `bodega_inventory` ~4.918; `production_drilling_source_reports` ~4.693; `production_import_exceptions` ~3.513; `production_mine_sectors` ~1.503.
- No deducir diferencias de filas entre apps: ambas usan la misma base. Las diferencias pueden ser interfaz, consultas, permisos, variables, Storage, API, cron o versiones desplegadas.

## Brechas comprobadas en el Vercel recuperado

Existen las variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, actualmente configuradas para preview.

La app original también configura, y la recuperada aún no:
- **WhatsApp/Green API**: `GREENAPI_API_URL`, `GREENAPI_ID_INSTANCE`, `GREENAPI_API_TOKEN_INSTANCE`, `GREENAPI_WEBHOOK_TOKEN`.
- **Trabajos programados**: `CRON_SECRET`.
- **IA**: `OPENAI_API_KEY`.
- **Archivos**: `BLOB_READ_WRITE_TOKEN`.
- **PostgreSQL complementario**: `POSTGRES_URL` y variables relacionadas.
- **Avisos push**: `WEB_PUSH_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- **Otros ajustes**: `HSE_CANONICAL_IMPORT_ENABLED`, `ADMIN_INIT_TOKEN` y parámetros Supabase adicionales.

**No trasladar secretos automáticamente**: verificar consumidor, permiso, entorno, webhook callback, dominio y costos antes de habilitar cada integración. No habilitar dos schedulers sobre una misma cola.

## Plan de conciliación pre-sync

1. Congelar inventario de deployments y configuraciones (solo nombres de secretos); definir un origen canónico.
2. Contrastar GitHub original con rama recuperada por commit cuando vuelva a estar accesible; no tratar el preview viejo como código íntegramente recuperable.
3. Auditar cada módulo contra tablas/vistas y funciones: permisos, RLS, consultas, versiones y disponibilidad de datos.
4. Auditar Supabase Storage y Vercel Blob (buckets, referencias, hashes, ACL, archivos huérfanos) antes de copiar binarios.
5. WhatsApp: comparar timestamps, mensajes, adjuntos, extracciones y actividades; conciliación incremental y deduplicación; evitar el grupo Mantenimiento deshabilitado.
6. Reponer variables e integraciones de forma aislada y una por vez en preview; probar contratos y permisos.
7. Demostrar 0 datos sobrescritos y 0 envíos/cron duplicados antes de considerar merge o dominio productivo.

## Puerta de seguridad

Este documento **no representa una sincronización ejecutada**. No se han copiado registros ni activado schedulers. El repositorio original no está accesible por GitHub, así que falta auditoría diferencial completa de su código.
