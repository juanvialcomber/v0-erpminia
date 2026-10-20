# MOTIL lab: fechas programadas de mantenimiento

Fecha: 18 de octubre de 2026.  
Rama de trabajo: `fix/lab-maintenance-calendar-20261018`.  
Base inspeccionada: `5f376e0`.  
Estado: **PASS local / listo para revisión en Preview**; pruebas, ESLint, TypeScript y compilación Next.js aprobados. El resultado de GitHub Actions, el despliegue Preview y la QA autenticada se registran en el PR. La promoción a `main` queda pendiente.

## Resultado esperado

Una OT programada para el 23 de octubre debe mostrar el 23 de octubre en terreno, indicadores y ficha del activo. Su fecha de creación no sustituye la fecha programada. Al recalcular o recargar la vista, la clasificación de atraso usa el día civil de `America/Santiago`, independientemente de la zona horaria del navegador o servidor. La actualización visible depende del nuevo renderizado o la recarga de cada vista.

## Cambios

Se reutiliza `lib/maintenance/work-order-calendar-date.mjs`, que valida fechas civiles y calcula diferencias de calendario sin introducir desfases por UTC o cambio de horario.

| Consumidor | Comportamiento corregido |
| --- | --- |
| `maintenance-mobile-panel.tsx` | Conserva el día de `scheduled_date` en las OT de terreno. |
| `maintenance-indicators-board.tsx` | Calcula atrasos según el día civil de Santiago. |
| `asset-qr-view.tsx` | Presenta «Programada: DD-MM-AAAA» o «Sin fecha programada», usando `scheduled_date`. |
| `asset-related-operations.tsx` | Conserva el día programado en «Próximos trabajos». |
| `preventive-plan-board.tsx` | Usa días civiles para hoy, vencimientos y próximos 30 días; distingue fecha ausente de inválida y formatea fechas posteriores. |
| `app/api/maintenance/preventive/route.ts` | Deriva el resumen preventivo con el mismo día de Santiago y la misma validación que la interfaz. |

Este bloque conserva los estados de OT, consultas, permisos y límites por organización. No agrega migraciones ni modifica registros operacionales. Las fechas de creación, cierre y eventos mantienen su significado de trazabilidad.

## Pruebas verificadas

[`maintenance-calendar-render.test.mjs`](../tests/maintenance-calendar-render.test.mjs): **4/4 PASS**. Ejecuta los cinco componentes TSX reales mediante ReactDOMServer y el helper real, con fuentes y navegación aisladas. Verifica:

- Fechas civiles y valores con prefijo de fecha: el 23 no se transforma en el 22 en Chile.
- QR con programación distinta de la creación, fecha ausente y fecha inválida.
- Clasificación del contador de atrasos al renderizar antes y después de la medianoche de Santiago, bajo UTC, Santiago y Tokio.
- Planificación preventiva durante cambios de horario de abril y septiembre, hoy chileno frente a UTC y límite de 30 días.

[`maintenance-preventive-calendar.test.mjs`](../tests/maintenance-preventive-calendar.test.mjs): **2/2 PASS** dentro de la suite completa. Ejecuta el GET real con base de datos simulada y reloj controlado. Verifica resúmenes consistentes en UTC, Santiago y Bangkok, cambios de horario y conservación del filtro de organización en las cinco lecturas. Los registros sin fecha o con fecha inválida permanecen visibles para revisión.

## Estado de validación al redactar

Evidencia de la ejecución de `corepack pnpm build` y del reintento acotado de los pasos pendientes:

| Validación | Estado verificado |
| --- | --- |
| Versiones de migraciones | **PASS**: 297 archivos, versiones únicas. |
| Suite completa | **PASS**: 1.730 pruebas; 0 fallidas, 0 omitidas. |
| ESLint, política de cero advertencias | **PASS**: finalizó y habilitó el paso siguiente. |
| TypeScript | **PASS**: `NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm typecheck`, código 0. |
| Compilación Next.js | **PASS**, código 0: Turbopack compiló en 20,3 s, TypeScript interno terminó en 47 s y se generaron 301/301 páginas estáticas. Heap de 4 GiB y valores ficticios de CI. |
| `git diff --check` | **PASS** para los cambios de calendario. |
| Preview de calendario y QA autenticada | El estado final se registra en el PR. Este documento acredita únicamente la validación local. |
| PR y publicación | Rama `fix/lab-maintenance-calendar-20261018` preparada para revisión; promoción a `main` pendiente. |

El primer intento se detuvo en TypeScript con `JavaScript heap out of memory`, cerca de 2 GB de heap, y código 134. Se comprobó un límite de memoria del contenedor de 8 GiB y se repitió únicamente TypeScript con heap de 4 GiB: terminó correctamente. Las pruebas y ESLint ya aprobados no se repitieron. La compilación Next.js posterior usó los valores Supabase ficticios de `.github/workflows/production-release-gate.yml`; el proceso no heredaba credenciales Supabase, PostgreSQL ni OpenAI.

Next emitió un aviso de generación estática deshabilitada para una página con runtime edge; la compilación finalizó correctamente. Los archivos generados `next-env.d.ts` y `tsconfig.tsbuildinfo` se restauraron a la base y no forman parte del cambio funcional.

Antes de promover a `main` se debe comprobar el acceso al Preview y verificar allí una OT con programación futura. Este documento no acredita QA autenticada ni despliegue.
