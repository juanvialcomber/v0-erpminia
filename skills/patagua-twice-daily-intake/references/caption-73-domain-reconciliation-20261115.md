# Conciliación de 73 textos asociados a multimedia — 2026-11-15

Fuente: Supabase producción, lectura sin mutaciones. Universo: mensajes de `motil_whatsapp_intake_exceptions_v1` con `disposition='media_processing_issue'` y `body` no vacío. Fotos/videos se conservan como evidencia; NO OCR.

## Resultado reproducible
- 73 mensajes únicos con texto.
- 13 citados directamente en `motil_whatsapp_daily_reports.findings[].source_ids` (8 maintenance, 4 production, 1 hse); todos los hallazgos citados tienen `review_status=pending`. **Citado no significa promovido.**
- 60 sin cita directa. La existencia de reporte en la misma fecha no prueba que el hecho esté registrado.
- 2 sin reporte diario de la misma fecha: 16804 (retiro de biela y volantes del chancador primario) y 17093 (revisión de vigas de harnero), 2026-10-18.
- Cero vínculos directos en `motil_whatsapp_operational_activities`, `motil_whatsapp_review_decisions` y `motil_whatsapp_module_updates_v1` al corte consultado.

## Casos priorizados de los 60 sin cita
- **Posible incidente / cambio de estado (revisar contra OT y parte de turno):** 273864 (M8x48 F/S por temperatura alta descanso 6), 274112 (falla acondicionador 00:50), 260145 (chancado terciario E/S 17:45), 400207 (Denver 1-6 E/S 12:00), 308084 (texto ambiguo '6:10 descanso n6'; no inferir estado).
- **Trabajo ejecutado / intervención (conciliar con mantenimiento, no crear OT retrospectiva):** 16804, 17093, 72594, 72951, 184587, 281796, 282048, 284525, 355284, 355286, 355287, 400199, 483365.
- **Inspecciones periódicas / condición reportada:** 24849, 39434, 70125, 87918, 142521, 216883, 366062, 381710, 407380, 407397, 417915, 444103. No contar como trabajos correctivos por defecto.
- **Ley/calidad y controles sin valor extraíble del texto:** 273867, 274852, 288493, 288593, 298182, 407919. No inferir resultados numéricos desde fotografías.
- **Entrega de turno / contexto:** 12804, 20095, 194543, 278821, 285769, 298910, 309824, 273868, 281550, 298184, 306100. No generar eventos independientes sin validar fuente.
- **Etiquetas de fotografías/partes de equipo, evidencia solamente:** 274356, 274357, 274358, 274359, 274360, 298169, 298172, 298173, 298175, 298177, 298179. No interpretar cada etiqueta como avería.
- **Otros textos técnicos con detalle pendiente de reconciliar:** 298165, 274604, 306100 y restantes mensajes del universo; conservar cuerpo íntegro y consultar por ID antes de promover.

## Gate de cierre
1. Comparar cada fuente con registro del área por equipo/fecha/hora, además del vínculo por ID; no declarar duplicado por similitud superficial.
2. Cuando el mensaje describe una falla o intervención, emitir **candidato a aviso** con evidencia y vínculo a OT si existe; decisión de Ariel/planificador para crear OT.
3. Registrar resultado por mensaje: `already_documented`, `new_evidence_pending_review`, `context_only`, `conflict`, o `not_verifiable`; mantener procedencia.
4. No cambiar KPIs, OT ni inventario hasta validación; validar SQL y RLS en preview antes de deploy.
