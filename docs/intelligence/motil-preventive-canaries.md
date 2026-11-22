# N3uralia Intelligence | MOTIL preventive canaries v1

Estado: CODE_INSPECTED / QA_PENDING. Cliente: MOTIL - Compania Minera La Patagua. Pais: Chile. Consumidor: cockpit de Ariel y jefaturas de Mantenimiento. Madurez compartida: PATTERN_ONLY. No convertir datos o logica especifica del cliente en servicio externo ni declarar una API productiva compartida.

## Contrato

- Evaluador determinista y no mutante: lib/intelligence/motil-operational-canaries.mjs
- API de lectura con organizacion y rol: app/api/intelligence/maintenance-guardrails/route.ts
- Datos operacionales: maintenance_work_orders (estados, timer, asignacion; excluye historicos importados), bodega_central_stock_canonicalization_summary_v1 (fecha de ultima sync) y motil_ai_core_errors (codigo y timestamp, sin mensajes ni prompts).
- En pantalla: components/maintenance/n3-operational-guardrails.tsx, consulta al abrir la vista de planificacion/jefatura y refresco cada 10 minutos mientras sigue montada. No es un worker permanente ni un monitor de Vercel externo.
- Sin migracion, cola persistente, cron adicional, LLM ni escrituras operacionales.

## Invariantes

1. OT terminada con timer running/paused o running sin inicio valido: P1.
2. Dos OT running para el mismo ejecutor: P1.
3. Pausa con timer_start_time activo: P1; idle con inicio residual: P2.
4. Corte de Laudus no disponible: P1; sin fecha o mayor a 36 horas: P2.
5. Codigo de error de fuente de IA repetido al menos dos veces en 24 horas: P1; otro error AI repetido al menos tres veces: P2.
6. Recuento parcial por limite de 1000 OT o 100 errores: revision parcial, nunca declarar sano el universo.

Una OT sin foto aun abierta, sin requisitos de material o un producto sin conteo fisico NO son defectos de software por si solos. Son condiciones que deben llevar a la siguiente accion del humano responsable.

## Seguridad, precision y costos

- Solo roles de planificacion/jefatura de mantenimiento con ED o admin explicito. Tecnico con ED no puede ver cola ajena.
- Sin lectura de inventario o errores de IA del dominio inventory si falta acceso a Bodega.
- Toda consulta PostgreSQL restringida por organization_id; los mensajes sensibles y secretos nunca se devuelven.
- Lectura de maximo 1000 OT en paginas de 200; maximo 100 errores AI. Solo el primer P1 se destaca, las observaciones adicionales estan plegadas.
- Cada señal tiene dedupe key, prioridad, fuente, accion humana y ruta, sin aprobacion ni remediacion automatica.

## QA y release

Tests: tests/motil-n3-operational-canaries.test.mjs y tests/motil-n3-canary-authorization.test.mjs. Verificar invariantes, permisos permitidos/denegados, cobertura y ausencia de mutaciones. Requiere CI exacto, preview READY, QA Opera, review y autorizacion de merge; no reemplazar gates por unit tests.

## Value Brief

Outcome: menos fallos de OT y Bodega detectados por la persona final. Metrica 1: incidentes confirmados detectados preventivamente / incidentes confirmados comparables. Metrica 2: tiempo evidencia->deteccion (con timestamps fuente). Guardrails: cero modificaciones autonomas de OT, stock o permisos; cero falsos positivos por conteos pendientes.
Baseline: aun no medido en poblacion de incidentes real comparable. Valor: L2 habilitador, sin ROI ni ahorro atribuible demostrado. Siguiente medicion: medir alertas verdaderas/espurias y tiempo humano residual despues de QA y release.
