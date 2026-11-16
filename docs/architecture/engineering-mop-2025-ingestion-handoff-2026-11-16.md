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
