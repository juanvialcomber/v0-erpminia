# Ingeniería y Proyectos — capacidades del asistente

## Fuente oficial Manual de Carreteras
- Editor: Dirección de Vialidad, Ministerio de Obras Públicas de Chile.
- Catálogo oficial: https://mc.mop.gob.cl
- Comunicado oficial: https://vialidad.mop.gob.cl/2026/01/29/vialidad-publico-nueva-edicion-del-manual-de-carreteras/
- Edición 2025 vigente desde 2026-01-01 según comunicado MOP.
- La aplicabilidad a una obra privada/minera debe revisarse por contrato, permisos y normas efectivamente exigibles; no asumir aplicación automática.
- No usar PDF de terceros como fuente canónica. No afirmar que los nueve volúmenes están ingeridos hasta comprobar archivos, versiones, integridad, derechos de reutilización y cobertura.

## Skills/capacidades requeridas
1. Solicitudes interdepartamentales: origen, responsable, prioridad propuesta, evidencia, doble validación y escalamiento de cambio urgente de programa a Gerencia. IA solo recomienda.
2. Programación: baseline aprobado, hitos, dependencias, recursos, cambios versionados y visualizador. No inferir duraciones.
3. Presupuestos: partidas, cantidades, unidades, precios fuente, revisiones, comparaciones y evaluación asistida. Separar estimación de presupuesto aprobado.
4. Control financiero: presupuesto aprobado, comprometido, gasto contabilizado, facturado y pagado son dimensiones distintas. Enlaces a transacciones canónicas, no copias.
5. Avances: evidencia por hito, avance físico y financiero con fórmula y denominador verificables; generar informes con citas.
6. Manual de Carreteras: recuperación por edición/volumen/capítulo/numeral/página, enlace MOP, fragmento y vigencia; abstención si la edición no está disponible.
7. Contratistas: alcance, órdenes, documentos, recepción, evidencias y permisos separados por rol/organización.

## Contrato de respuesta del asistente
- Toda cifra con fuente, fecha y estado de verificación.
- Presupuesto o cambio de programación: mostrar diferencias, riesgos, fuentes faltantes y responsable de aprobación; nunca aprobar ni comprometer recursos.
- Manual: citar edición, volumen, capítulo/numeral, página y URL. Si falta cualquiera, explicar la limitación.
- Ningún flujo automático crea una obligación financiera, cambia baseline ni aprueba solicitud.
- Mantener acceso tenant y permisos por acción. Los 17 permisos LEC reportados para Cristian no habilitan ED.
- Medir cobertura de proyectos reales, no sustituir los ~20 informados por 20 registros ficticios.

## Estado de integración
La API `app/api/intelligence/engineering-assistant/route.ts` solo usa planificación minera/topografía, tareas y referencias SERNAGEOMIN; NO tiene un índice del Manual ni presupuesto/proyectos canónicos. Estas capacidades son especificación para implementar, no habilidades ya activas.
