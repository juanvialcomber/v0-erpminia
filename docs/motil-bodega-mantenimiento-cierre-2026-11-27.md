# MOTIL — Cierre operativo Mantenimiento + Bodega | Semana 23–27 nov 2026

**Estado:** plan de ejecución y aceptación, no acta de aprobación. La Carta Gantt enviada el 13-nov propone el primer bloque del 16 al 27-nov; el G0 del 20-nov (responsables, prioridades y tiempos de validación) no se presume formalmente aprobado. Estándar: una fuente por dato, evidencia, autoridad humana y release exacto.

## Evidencia de partida (lectura productiva 22-nov, no forecast)
- OT Mantenimiento: **81** total, **58 completed**, **13 open**, **10 in_progress**. 1 timer **running**, 8 **paused** (7 sin actualización en más de 7 días). Requieren revisión humana, **nunca** cierre/pausa automática.
- Materiales OT: **15 líneas vinculadas a 3 OT finalizadas**; **0 líneas de materiales en OT activas**. No convertir esas 15 líneas en pedidos actuales, aunque tengan estado `procurement_needed`.
- Bodega Central Laudus (002): **10.245 productos** en cola de verificación; **0 conteos físicos registrados**. Vista de preparación: 8.317 candidatos a asignar saldo cero, 146 aperturas candidatas, 1.043 fuentes desactualizadas, 56 conflictos de identidad, 17 cantidades fraccionarias, 5 negativos, 1 histórico/no asignado y 660 sin saldo inicial.
- Registros operacionales MOTIL: 12.269 filas en `warehouse_stock`; los conteos y las fuentes Laudus permanecen separados. Nunca sumar cantidades de diferentes unidades de medida para reportar stock total.
- API de inventario Laudus recuperada desde la vista de frescura; 626 diferencias de saldo históricas, ninguna considerada conciliada automáticamente. PR #325 corrige materiales OT (vista de productos restringida), aliases duplicados, históricos visibles sin marcarlos activos y autorización del POST de entrega.
- Fuente de este corte: consultas de solo lectura a MOTIL Supabase, API productiva y repositorio GitHub. Los valores variarán tras las siguientes sincronizaciones.

## Entregables y calendario de control

| Fecha | Área / resultado que debe verificarse | Autoridad de validación | Evidencia para aceptar |
| --- | --- | --- | --- |
| Lun 23 nov | Bodega y Mantenimiento sin errores de lectura; PR de recuperación en preview exacto; OT históricas distinguidas de vigentes; confirmar G0 pendiente | N3uralia + Ariel | CI, build, navegador autenticado, logs, lista de responsables |
| Mar 24 nov | Bodega Central: Esteban y Ariel ingresan desde sus propias cuentas; sólo ellos pueden confirmar un conteo físico; fuente cambiada produce revalidación | Esteban responsable, Ariel apoyo | Registros de conteo **real** con SKU/cantidad/fecha/actor; 403 para no asignado; RLS y vencimiento de Ariel |
| Mié 25 nov | Mantenimiento: una OT vigente con requerimiento real → reserva validada → entrega explícita → instalación/devolución, o faltante → Compras | Ariel / jefe de taller + Esteban | Trazas por OT-producto-movimiento, auditoría, estados, controles de permiso, ninguna entrega ficticia |
| Jue 26 nov | QA de ciclo OT: asignar, iniciar, pausar/reanudar, evidencia, cerrar ejecución y supervisar/rechazar; revisar timers prolongados con ejecutores | Ariel / supervisores / mecánicos | Matriz por perfil/OT real y pruebas sintéticas separadas; no alterar historial por pruebas |
| Vie 27 nov | UAT final Bodega + Mantenimiento; acta de hallazgos y excepcionalidades; aprobación de jefaturas para cierre del bloque | Esteban, Ariel y Pedro Zegers | Checklist firmable, SHA READY, logs sin 5xx nuevos, backlog de pendientes con dueño y fecha |

## Criterios mínimos de aceptación

### Bodega
- Lectura del corte Laudus de Bodega Central (002) y fecha/frescura visibles sin confundir stock fuente, stock operacional, stock reservado y conteo físico.
- Sólo Esteban y Ariel (asignación temporal vigente) confirman conteos realizados por ellos; observaciones en diferencias. Nadie ajusta saldos automáticamente.
- Excepciones de identidad, negativos, fracciones, faltas de fuente, cambios posteriores al conteo y saldos iniciales sin respaldo permanecen en revisión.
- Las acciones operacionales actuales no se deshabilitan por una conciliación aún incompleta. Registrar bloqueos, no asumir stock validado.

### Mantenimiento y conexión con Bodega/Compras
- No presentar material de OT histórica como solicitud vigente. Desde OT activa, usuario habilitado registra material real; producto/organización/activo y origen trazables.
- Nunca elegir una cantidad Laudus arbitraria si varios códigos externos apuntan al mismo producto; presentar cantidad desconocida y revisión de identidad.
- Las cantidades sólo se comparan por SKU/unidad. No sumar litros, unidades, kg, metros entre productos.
- Entrega de material reservado necesita permiso MANT_OPERACIONES ED, sesión y organización concordantes, OT operacional y RPC auditable. El rol LEC no emite material.
- No declarar materiales “entregados” sólo porque no aparecen faltantes; validar entrega por cada requerimiento.
- No crear, detener, cerrar ni aprobar OT de producción por automatización de QA. Los 8 timers pausados y el running prolongado se escalan al responsable.

### Release
- Commit/PR exacto con security, migraciones, pruebas y build PASS.
- Preview READY para SHA exacto y QA autenticado con perfiles reales o delegación explícita; denegaciones también probadas.
- Merge a main sólo con aprobación para el bloque validado, production READY del SHA final, smoke y revisión logs.
- Si un hito no puede verificarse, marcar **HOLD** con responsable y fecha; no convertir la ausencia de evidencias en PASS.

## Responsables y riesgos no resueltos
- **Esteban Díaz:** stock físico Bodega Central, discrepancias y conteos.
- **Ariel López:** planificación/operación mantenimiento, coordinación con talleres, apoyo temporal de conteos, validación del ciclo OT.
- **Pedro Zegers:** prioridad y desbloqueos inter-áreas; aceptación ejecutiva del bloque.
- **N3uralia:** desarrollo, conciliación de fuentes, RBAC/RLS, UX, tests y evidencias de release.
- **Dependencias humanas:** selección de materiales prioritarios y primeros conteos físicos reales; una OT real con material solicitado; revisión de timers y aceptación del G0. No reemplazables por tests.
- **Dependencias técnicas:** la vista previa Vercel del PR nuevo aún no fue creada en el proyecto canónico; el PR no debe confundirse con código en producción.
