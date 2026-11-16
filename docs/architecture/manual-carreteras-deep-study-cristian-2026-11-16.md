# Manual de Carreteras MOP | estudio profundo aplicado a Ingeniería y Proyectos (2026-11-16)

## Fuentes y estado

Fuente oficial: https://mc.mop.gob.cl/ . Comunicado Vialidad 29-01-2026: https://vialidad.mop.gob.cl/2026/01/29/vialidad-publico-nueva-edicion-del-manual-de-carreteras/

El MOP declara vigente desde 01-01-2026 la edición 2025. El portal mc.mop.gob.cl solicita correo y código: no se descargaron ni validaron íntegramente los nueve volúmenes; no hay corpus importado ni prueba de derechos de redistribución. El portal genérico MOP aún menciona 2020; priorizar comunicado de Vialidad y archivo oficial autenticado.

## Qué es y para qué sirve

Sistema integrado de referencia técnica para planificar, estudiar, diseñar, construir, operar, conservar y controlar infraestructura vial. Vincula métodos, planos, especificaciones, ensayos, seguridad y sostenibilidad; no reemplaza proyecto, profesional responsable, contrato ni aprobación. En obras mineras privadas la aplicabilidad depende de contrato, permiso, bases y especificaciones particulares.

## Volúmenes y aplicación a ingeniería

1. Planificación, Evaluación y Desarrollo Vial: justificar opciones, alternativas y evaluación de inversiones.

2. Procedimientos de Estudios Viales: estudios, topografía, geotecnia e información requerida según obra.

3. Instrucciones y Criterios de Diseño: geometría, pavimento, drenajes y estructuras. No inventar parámetros de cálculo.

4. Planos de Obras Tipo: figuras/detalles que deben conservar fuente y versión de dibujo.

5. Especificaciones Técnicas Generales de Construcción: partidas, materiales, procedimientos y requisitos de calidad; complementar con especificaciones particulares.

6. Seguridad Vial: sistemas de protección, contención y seguridad durante uso/obras.

7. Mantenimiento Vial: conservación, intervenciones y estándares de operación.

8. Especificaciones y Métodos de Muestreo, Ensaye y Control: ensayos de laboratorio, muestras y evidencias de conformidad.

9. En edición 2025 cambia a Lineamientos, criterios y requisitos para el desarrollo de proyectos viales sustentables (nombre antiguo: Estudios y Criterios Ambientales en Proyectos Viales); se actualiza capítulo 9.800 de sustentabilidad en mantenimiento.

## Cambios oficiales edición 2025

Según Vialidad: refuerzo de taludes y anclajes de suelos; factores de EE para pavimentos; uso de velocidad de onda de corte en contexto sísmico de puentes/suelos; mezclas asfálticas con caucho; sistemas de contención y protección para motociclistas; vías de bajo tránsito; ensayos del Laboratorio Nacional y clasificación Superpave por clima; sustentabilidad en mantenimiento. Son resúmenes públicos, NO numerales técnicos verificados.

## Necesidad explícita vs inferencia

Levantado para Cristian: consultas técnicas del Manual, asistencia para presupuestos e informes de avance; programación y control de proyectos, solicitudes entre departamentos, coordinación de Ingeniería/Servicios Generales/Contratistas. Cristian clasifica solicitudes; urgentes/críticas implican cambio del programa y dos aprobaciones supervisor+CEO. Cantidad aproximada de 20 proyectos mencionada verbalmente, NO comprobada en la base.

Casos por VALIDAR con Cristian (no hechos confirmados): caminos internos y accesos, drenajes, mejoramientos granulares, control de taludes, cubicaciones, especificaciones de contratistas, control de ensayos, recepción y mantención. No asumir que todos sus proyectos sean viales.

## Diseño de asistente que se desprende del estudio

1. Consultar por edición, volumen, capítulo, numeral, tabla/figura y página; devolver fuente oficial y fecha, abstenerse sin evidencia comprobada.

2. Detectar insumos de diseño faltantes; NO calcular dimensiones o afirmar cumplimiento con datos ausentes.

3. Preparar listas de partidas candidatas y checklists técnicos vinculados al alcance del proyecto y a la especificación particular; costos y cantidades únicamente desde fuentes verificadas.

4. Contrastar requisitos del Manual con contrato/permiso/especificación particular sin declarar aplicación legal automática.

5. Generar informes de avance enlazando hitos/evidencias, separar avance físico, presupuesto, comprometido, contabilidad, facturación y pago.

6. Documento público MOP y datos privados del tenant separados, autorización por usuario y organización; la IA no firma, altera baseline, ni aprueba.

## Diseño documental y evaluación

Custodiar URL, edición, volumen, capítulo, página, hash, vigencia, procedencia y estado (verificado/pendiente/superado); extraer tablas, dibujos y referencias cruzadas sin convertir un plano a texto inventado. Recuperación híbrida lexical/vector filtrada por versión; validar 30-50 consultas técnicas, errores, tablas, versiones, citas y abstenciones con revisión del profesional.

Investigación arXiv: VersionRAG https://arxiv.org/abs/2510.08109 (filtros/versiones); GEMS-RAG https://arxiv.org/abs/2610.33277 (figuras, tablas y estándares); RAGChecker https://arxiv.org/abs/2408.08067 (diagnóstico separado retrieval/generation); Normative RAG https://arxiv.org/abs/2604.09868 (estructura y vínculos). Son pruebas en otros dominios, no métricas propias de MOTIL.

## Hallazgo de integración: no modificar datos todavía

Supabase accesible denominada motil contiene profiles, cargos, role_matrix, production_monthly_plans, canonical_procurement_requests_v1 y document_approvals_v1. Consulta read-only encontró un perfil de Cristian con cargo JEFE INGENIERIA Y PROYECTOS pero organización llamada N3uralia: no equivale a certificar tenant La Patagua. No aparecieron tablas por nombres engineer/project. El proyecto Vercel v0-erpminia devolvió 403 para la conexión actual; no hay identidad de environment/production verificada. NO se migró ni escribió nada.

## Gate siguiente

Verificar archivos originales vigentes (acceso autorizado), reconciliar tenant desde entorno desplegado, acordar casos reales de Cristian, evaluar respuestas con citas verificadas, y solo entonces integrar la fuente a la API y correr QA end-to-end. Ninguna publicación o ingestión se declara completada.