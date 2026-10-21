# MOTIL OS — Plan maestro de mejora controlada

Fecha base: 2026-10-20. Documento de trabajo, no autorización de despliegue.

## Principios de seguridad (bloqueantes)

- Ariel y La Patagua mantienen su operación actual sin interrupciones.
- Auditoría de producción solo SELECT; nada de actualizar OT, horómetros, inventario, reservas, estados, usuarios o aprobaciones.
- No modificar jobs, email/WhatsApp, notificaciones, integración o permisos durante la auditoría.
- Desarrollo posterior: ramas aisladas, datos ficticios o anonimizados fuera de producción, pruebas regresivas y revisión de compatibilidad.
- Nunca merge a main, cambiar esquema ni desplegar efectos operativos sin aprobación explícita y validación.
- KPI sin base suficiente -> indicar ausencia de dato y cobertura; no inventar porcentaje.
- Los scores 8.x son estimaciones de producto; elevarlos requiere evidencia de QA, no autocalificación.

## Backlog priorizado y verificable

| ID | Bloque | Alcance | Evidencia de aceptación | Estado |
|---|---|---|---|---|
| S0 | Protección operacional | límites de escritura, permisos, cron, rollback, flujo de aprobación | inventario de procesos sensibles y checklist de cambios | En curso; reglas documentadas |
| D1 | Identidad canónica del activo | OT, horómetro, equipo, faena, eventos, evidencia y conflictos de estado | 100% OT auditadas con referencia canónica o excepción documentada | Auditoría inicial completa: 11/11 OT referenciadas |
| D2 | Calidad de fuentes e ingesta | email, WhatsApp, Excel, deduplicación, fecha, fuente, cobertura | casos reproducibles, registros de procedencia, no sobrescritura indebida | Pendiente |
| M1 | Ciclo OT | planificar, asignar, iniciar, pausar, reanudar, evidenciar, aprobar, cerrar | pruebas por rol sin escrituras productivas y evidencia de flujo | Pendiente |
| M2 | Planificación semanal | disponibilidad personas/equipos, prioridad, repuestos, ventanas, seguimiento | conflictos y cumplimiento definidos con denominadores verificables | Pendiente |
| I1 | Bodega y materiales | requerimiento, reserva, entrega, instalación, devolución, conciliación | trazabilidad de extremo a extremo sin inferir movimientos faltantes | En auditoría |
| C1 | Compras | necesidad, solicitud, aprobación, pedido, recepción, entrega | estados encadenados con evidencias y excepciones | Pendiente |
| F1 | Finanzas | costos por OT/activo/centro, mano de obra, insumos, conciliación | cálculos reconciliados y permisos de Daniel validados | Pendiente |
| P1 | Producción | equipo–horómetro–detención–producción, cortes y fuentes | KPI de producción con trazabilidad y cobertura | Pendiente |
| K1 | Indicadores de confiabilidad | detención/retorno, causas, duración, MTTR/MTBF y disponibilidad | no calcular disponibilidad horaria sin tiempo observado y base válida | Pendiente |
| T1 | Torre de Control | 6 vistas, logo, TV sin scroll, responsive, alertas con evidencia | QA 1080/900/768, sin clipping, 30 s rotación, 60 s refresco | Implementado en main; QA multirresolución pendiente |
| L1 | Legal / SERNAGEOMIN | documento individual, rol, vencimiento, evidencia y normativa | pruebas de permisos y alertas sin falsos positivos | Pendiente |
| A1 | Inteligencia explicable | RAG manuales/OT/normativa, evidencia, incertidumbre, aprobación humana | evaluación adversarial, no autonomía sobre estados críticos | Pendiente |
| U1 | QA integral y seguridad | Ariel/Joaquín/Matías/Daniel/Elías y demás roles, RLS, carga, accesibilidad | flujos críticos aprobados, cero fallos bloqueantes | Pendiente |
| SK1 | Skills del equipo | Canonical Intake, Maintenance Development, Frida, Ciclope, Exelito, PDFino, Hume | contrato entrada/fuente, límites, fixtures, tests, métricas de error | Especificación inicial documentada |
| R1 | Lanzamiento controlado | feature flags, plan rollback, staging, aprobación explícita | gates superados y autorización previa a cualquier merge | Pendiente |

## Fases y orden de ejecución

1. **Protección + diagnóstico**: S0, D1, I1; inspección sin efectos laterales.
2. **Fundamentos de calidad**: D2, SK1; contratos de datos y pruebas aisladas.
3. **Mantenimiento completo**: M1, M2; flujos sin escribir en producción.
4. **Cadena operativa**: C1, F1, P1, K1; indicadores solo con evidencia.
5. **Experiencia y cumplimiento**: T1, L1, A1.
6. **QA y despliegue**: U1 y R1, solo con aprobación del usuario.

Dependencias: D1 y D2 anteceden K1/A1; I1 precede C1/F1; M1 antecede M2 y los cálculos de cumplimiento; S0 aplica a todos.

## Skills: checklist común

- Fuentes válidas y definición de identidad de cada entidad.
- Qué datos pueden leerse; prohibición de escrituras productivas de prueba.
- Pruebas para estado ausente, duplicado, desactualizado, parcialmente aprobado, sin stock y permiso denegado.
- Evidencia de salida y evaluación; respuesta honesta ante falta de base.
- Aprobación humana para cambios con consecuencias reales.
- Criterio de rollback y release gate (nunca merge automático).

## Próxima acción ejecutable

Auditar la ruta **requerimiento -> abastecimiento -> compra -> recepción -> entrega -> instalación -> conciliación**, distinguiendo tablas y vistas canónicas. Documentar cobertura y brechas antes de decidir código. Solo SELECT.

## Registro de avances

- 2026-10-20: 188 equipos canónicos, sin código/validación faltante; 11/11 OT enlazadas por canonical_asset_id; 7 eventos de asset_insert no representan disponibilidad actual.
- 2026-10-20: 6 requerimientos procurement_needed con faltantes; 6 confirmaciones de instalación enlazadas a OT y con estado de conciliación; work_order_parts vacío, sin implicar ausencia de entrega por otros flujos.
