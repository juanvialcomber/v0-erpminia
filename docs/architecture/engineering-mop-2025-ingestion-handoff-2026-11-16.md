# MOTIL / Ingeniería: paquete de referencias MOP 2025

## Estado verificado (16-11-2026)
Se procesaron y verificaron localmente **12 archivos originales**: 11 PDF (resoluciones 1873/348; Manual de Carreteras V1 Tomo II y V2-V9) y un Excel de partidas V5. Se generó un paquete gzip NDJSON con **13.550 fragmentos, 7.221 páginas PDF referenciadas y 400 partidas técnicas sin precio**; validación local de los 12 SHA-256 y cero claves duplicadas. **6.383 páginas tienen texto recuperable y 838 páginas no**; el contenido gráfico/planos y fórmulas requerirá QA visual aun cuando una página sí tenga texto. Resolución 348 complementa/corrige 1873. No se debe afirmar que todos los planos son legibles automáticamente.

Los originales **no** se agregaron a GitHub (derechos de autor y peso); el paquete temporal se conserva como artefacto de esta conversación. El repositorio NO contiene el contenido íntegro ni presenta una biblioteca disponible en producción hasta completar la carga.

## Cambios de aplicación preparados en esta rama
- Migración `20261116183000_engineering_mop_reference_library_v1.sql`: documentos, fragmentos, partidas, índice full-text español y RPC privadas con RLS; ninguna modificación a tablas operacionales.
- `scripts/import-mop-2025-reference.mjs`: importador idempotente con validación de hashes, lote acotado, 12 fuentes, 400 partidas, dry-run por defecto y doble resguardo `--execute` / `MOTIL_MOP_INGEST_APPROVED=YES`.
- `lib/engineering/mop-reference.mjs` y `lib/intelligence/engineering-mop-library.ts`: búsqueda y referencias con edición, volumen, página PDF, SHA; no extrapolan aplicabilidad a La Patagua.
- `app/api/intelligence/engineering-assistant/route.ts`: consulta MOP condicionada a autorización actual; responde sin inventar si no hay tabla, fuente o resultado. Mantiene asistentes operacionales en lectura y distingue partidas de costos.
- `components/engineering/mop-assistant.tsx` integrado a `app/dashboard/ingenieria/proyectos/page.tsx`: chat acotado y lista visible de citas, estado real de biblioteca y partidas sin precio.
- `tests/engineering-mop-reference.test.mjs`: pruebas de la política de citas, falta de precios, controles de escritura y autorización.

## Importación controlada
1. Confirmar project ref `ttlptyheuqeotadtcbaw` y tenant de Cristian frente a la aplicación desplegada; actualmente la base accesible tiene una organización llamada N3uralia, sin organización separada denominada La Patagua. No inventar cambio de tenant ni mover perfiles.
2. Revisar migración en branch/preview y correr QA antes de DDL, en especial RLS y no afectación del módulo actual.
3. Obtener el artefacto `MOTIL_MOP_2025_Paquete_Ingesta.zip` de esta conversación, extraer `mop_2025_complete.ndjson.gz` y manifest/QA.
4. Ejecutar dry-run sin llaves:
   `node scripts/import-mop-2025-reference.mjs --pack ./mop_2025_complete.ndjson.gz`.
5. Tras autorización/QA, en un entorno explícitamente validado y con credenciales sólo de servidor:
   `MOTIL_MOP_INGEST_APPROVED=YES node scripts/import-mop-2025-reference.mjs --pack ./mop_2025_complete.ndjson.gz --execute`.
6. Consultar recuentos en tablas y las RPC `search_engineering_mop_v1` / `search_engineering_mop_partidas_v1` con sección específica. Verificar no se filtren datos de otro tenant y que las citas correspondan a la página.
7. Verificar preview autenticada del SHA exacto, build/typecheck, al menos 20 consultas con citas V1-V9, resolución 348 y partidas; QA de planos y ecuaciones por fuente original. Merge/release sólo tras pasar gates.

## Riesgos y bloqueos actuales
- Proyecto Vercel `v0-erpminia` sigue respondiendo 403 para el equipo conectado: sin preview ni runtime QA confirmado.
- No se aplicó migración en Supabase, no se importó el índice a DB y no se han subido PDF originales al bucket privado `module-documents`. La biblioteca está **STAGED**, no `CONNECTED`.
- No se verificaron aún build/typecheck ni todos los tests contra el commit actual.
- La cantidad y naturaleza de proyectos de Cristian no están validadas; el Manual es aplicable a obras viales o adoptadas contractualmente, no a toda ingeniería minera. Ningún módulo actual puede emitir diseños, presupuestos monetarios, conformidad HSE ni aprobaciones desde estos documentos.

## Checkpoint de ejecución — 16-11-2026, verificación posterior en Opera
- **Paquete de ingesta validado en contenedor:** 12 SHA-256 de archivos originales correctos; 13.550 fragmentos, 6.383 páginas con texto, 838 sin texto, 400 partidas únicas; 0 códigos fuera de formato, 0 fragmentos con longitud mayor a 3.000 caracteres. Paquete: `MOTIL_MOP_2025_Paquete_Ingesta.zip` (adjunto conversación), NO almacenado en GitHub ni en Supabase.
- **Identidad del proyecto verificada mediante Vercel:** `v0-erpminia` / `prj_EaDtlCXr00V6feocyDavSMsMXtaZ` apunta a `https://ttlptyheuqeotadtcbaw.supabase.co`; entorno actual de producción atiende `www.motil.app`, SHA `5adfbc72efecb0150c5f1b9c9eb12b066f0902ff` observado. `/dashboard/ingenieria/proyectos` responde 404 en producción por no estar merged.
- **Base inspeccionada read-only:** `public.engineering_mop_documents_v1`, `engineering_mop_chunks_v1` y `engineering_mop_partidas_v1` NO existen. Ningún documento coincidente con Manual/Carreteras en `documents`, `module_documents`, `production_source_documents` ni Storage; no hubo migración ni cargas. Base tiene una organización con nombre `N3uralia` y un perfil de Cristian: revisar el mapping de organización antes de asociar operaciones privadas.
- **Rama corregida:** no clasificar presupuestos operacionales genéricos como consulta del MOP y devolver estado de la biblioteca aunque briefing de Topografía no esté disponible. Se agregó regresión para ambos casos.
- **Bloqueo real de preview:** Vercel `create_deployment` para GitSource con SHA exacto respondió `403 You don't have permission to create a v0 Deployment for this Vercel project: v0-erpminia`. Autorización de lectura Vercel de equipo restaurada en Opera, pero escritura v0 despliegues NO autorizada. El último preview READY corresponde a `f5ce1dc`, no incluye el corpus nuevo. `vercel` CLI y checkout integral del repo no existen en el contenedor; remoto `github.com` no resuelve por DNS, por lo que NO se ejecutó `scripts/preflight.sh` ni build en este turno. No intentar crear un proyecto nuevo para evadir el 403 o sustituir preview por producción.
- **Release gate:** `HOLD: LOCAL_PREFLIGHT_UNAVAILABLE + VERCEL_CREATE_V0_DEPLOYMENT_FORBIDDEN`. No hay preview exact SHA ni QA autenticado; NO aplicar DDL ni ingesta a la base de producción, no promover ni hacer merge. Sin declararlo conectado.
- **Próximo desbloqueo autorizado:** permiso de crear deployment v0 o flujo oficial de preview desde la integración Git/Vercel, más checkout local para ejecutar preflight. Con ese QA, ejecutar migración revisada, ingesta acotada, contrastes de páginas/citas y auditoría de RBAC antes de liberar.
