# Ingenieria y Proyectos | Especificacion inicial de integracion

Fecha: 2026-11-13
Estado: propuesta de arquitectura en rama; sin aprobacion funcional ni cambios de datos.
Fuente de requerimientos: levantamiento inicial con Cristian Vidal Roa. Ninguna pregunta cerrada.

## Objetivo y frontera
Administrar solicitudes interdepartamentales, cartera de ~20 proyectos (cantidad informada, no verificada en BD), programacion, presupuestos, ejecucion, avances y contratistas. No confundir este dominio con planificacion minera y topografia ya implementadas.

## Evidencia tecnica consultada
- Supabase motil ttlptyheuqeotadtcbaw: no se localizaron tablas cuyo nombre incluya project/engineer/budget para gestion de proyectos en la consulta inicial.
- Existen canonical_procurement_requests_v1 con organization_id, cost_center_code, priority, status, work_order_id; procurement_intake_requests con source_type y referencias a activos/OT.
- Existen document_approvals_v1 con approval_level, required_role, assigned_to y approved_by; se evaluara adaptacion sin asumir que document_id corresponde a proyectos.
- Existen finance_payment_requests, que representan solicitudes de pago, no evidencia automatica de pago ejecutado.
- Codigo existente: app/api/intelligence/engineering-assistant/route.ts verifica contexto de organizacion, cargo JEFE ING. PLA MINA, permiso de Topografia y permanece read-only. No modificar ni ampliar este permiso a gestion de proyectos por defecto.
- lib/production/engineering-source-readiness.mjs protege frente a fuentes topograficas no verificadas; los avances de obra requieren una fuente independiente.
- docs/ENGINEERING_INTEGRATION_RC_20261009.md documenta limites de plan minero, evidencias, roles y SERNAGEOMIN; sus hallazgos historicos no certifican estado actual.

## Flujo propuesto (no aprobado)
1. Solicitud borrador con unidad solicitante, alcance, prioridad sugerida y adjuntos.
2. Revision supervisor/autorizador segun matriz por validar.
3. Evaluacion tecnica y presupuestaria.
4. Programacion propuesta sobre capacidad y dependencias.
5. Si cambia programa aprobado, derivar a Gerencia; nunca autorizar solo por etiqueta urgente.
6. Ejecucion con hitos, evidencia, costos vinculados y cambios versionados.
7. Recepcion y cierre con responsables distintos y auditoria.

No codificar el circuito de firmas mientras no se confirme.

## Datos y ownership
Extender dominios existentes cuando su semantica coincida. Para una futura migracion, evaluar entidades projects, project_requests, project_tasks, project_progress, project_changes, project_budget_versions, project_cost_links y project_document_links solo despues de mapear todas las tablas y claves existentes.

Requerimientos no negociables:
- organization_id, RLS/servidor, permisos por accion y trazabilidad actor/timestamp.
- Datos canonicos de compras, pagos, OT, personas, activos, proveedores y documentos se referencian por ID, no se copian.
- Separar avance fisico, compromiso, gasto contabilizado, facturado y pagado.
- Baseline aprobado y cada reprogramacion o revision de presupuesto inmutables.
- Estados vacio, parcial, error y acceso denegado; sin cifras inventadas.
- Ninguna IA cambia el estado de proyectos ni aprueba compromisos.

## Arquitectura de IA y programacion
Primero reglas deterministicas, dependencias y restricciones de recursos. Comparar heuristica simple con planificador por restricciones solo si se dispone de duraciones y recursos reales. Un asistente documental RAG debe citar fuente/version y abstenerse ante recuperacion insuficiente.
Investigacion revisada:
- https://arxiv.org/abs/2511.13214 (RCPSP con incertidumbre; resultados no transferibles directamente)
- https://arxiv.org/abs/2508.14066 (desafios industriales RAG: seguridad, calidad y evaluacion humana)
- https://arxiv.org/abs/2401.15884 (evaluacion/correccion de recuperacion)

## Gate para implementar
1. Inventariar ruta UI, matriz de modulo y tablas relacionadas (incluyendo posibles nombres en espanol/obras).
2. Validar responsables y aprobaciones con Cristian/Gerencia.
3. Obtener inventario autentico y fuentes de los ~20 proyectos.
4. Diseñar migracion no destructiva y pruebas de aislamiento tenant.
5. Implementar una ruta vertical read-only/empty-state primero; luego escritura de solicitudes solo tras validar permisos.
6. QA desktop/movil, tests, build, preview exact-SHA, revisiones independientes y aprobacion explicita antes de merge.

## Pendientes de validacion
- Cargo y autoridad de Cristian; subareas Ingenieria, Servicios Generales y Contratistas.
- Aprobador de primera y segunda firma; reglas de urgencia y Gerencia.
- Definicion de proyecto, trabajo menor y OT; prioridad y excepciones.
- Plantillas de costos, moneda, centros de costo, lineas, revision y estados de pago.
- Fuente, periodicidad y denominador del porcentaje de avance.
- Fuente documental y version del Manual de Carreteras.
- Alcance de contratistas, accesos y recepcion.
- Inventario real de proyectos y relacion con movimientos Laudus.

## No ejecutado
No se crearon tablas, no se alteraron filas, no se habilitaron permisos, no se desplego ni se fusiono a main.
