# MOTIL Value Ledger

## Objetivo

Demostrar valor operacional y económico sin convertir volumen, exposición o estimaciones en ahorro realizado.

Cadena obligatoria:

`dato -> contexto -> inteligencia -> decisión -> acción humana -> outcome -> impacto observado -> evidencia recurrente -> precio defendible`

## Escalas

- L1 conectividad
- L2 visibilidad operacional
- L3 inteligencia
- L4 decisión asistida
- L5 autonomía controlada

- E0 narrativa
- E1 volumen/cobertura
- E2 desempeño medido
- E3 impacto observado
- E4 valor recurrente

## Gate 2027

Para defender expansión comercial:

1. Procesos críticos objetivo: L4 + E3.
2. Automatización seleccionada: L5 sólo con autorización, auditoría y rollback.
3. E4 requiere impacto repetido en varios ciclos, no un caso aislado.
4. Nunca usar monto bajo gestión, exposición detectada o monto priorizado como ahorro.
5. Cada evidencia E3 debe tener actor, timestamp, resultado, base de cálculo y referencia trazable.

## Métricas mínimas

- decisiones asistidas;
- tasa de aceptación/rechazo;
- tiempo medio de revisión;
- outcomes cerrados;
- falsos positivos;
- reducción de riesgo observada;
- minutos observados evitados;
- valor CLP observado con evidencia;
- cobertura de procesos críticos;
- recurrencia mensual.

## Estado observado 2026-10-24

El scorecard existente está preparado para L4, pero la evidencia permanece en E1 hasta que exista uso humano medido. Los gates mínimos actuales exigen:

- al menos 20 revisiones para calibración;
- al menos 5 outcomes cerrados;
- al menos 3 evidencias E3.

Estos umbrales habilitan escala inicial, no E4.


## 2026-10-24 — Cockpit Finanzas / Daniel

- Problema previo: la portada mezclaba readiness técnico, calidad de fuentes, regulación, caja, forecast, concentración y trazabilidad en una sola secuencia.
- Cambio: la portada de Finanzas se reduce a exposición Laudus, vencido, costo reconocido, compras comprometidas, top de revisión, CxP aprobadas en MOTIL y concentración.
- Regla semántica: exposición Laudus y CxP aprobadas en MOTIL se muestran como universos distintos. Ninguno se presenta como ahorro.
- Evidencia habilitada: el cockpit usa `motil_laudus_finance_review_queue` para priorizar obligaciones abiertas sin mutar Laudus ni canonicalizar deuda.
- Adopción: el acceso a `/dashboard/valor` se habilita a usuarios con acceso financiero real, incluido el cargo financiero restringido.
- Métrica siguiente: registrar decisiones humanas, tiempo de revisión, outcomes y E3 observados.


## 2026-10-25 — Feedback humano Finanzas Laudus

- Problema previo: el cockpit priorizaba obligaciones, pero no dejaba evidencia de si Finanzas revisó, difirió o descartó la prioridad.
- Capacidad: cada obligación priorizada puede registrar una decisión humana `accepted | deferred | rejected` usando el RPC existente `motil_record_laudus_finance_review_feedback`.
- Evidencia persistida: organización, factura Laudus, decisión, motivo cuando corresponde, monto observado, actor y timestamp.
- Autoridad: feedback humano solamente. No aprueba deuda, no registra pagos, no modifica Laudus y no muta el canónico financiero.
- Antiinflación: el scorecard cuenta facturas únicas por su última revisión; clics repetidos no aumentan artificialmente adopción.
- Estado actual verificado antes del uso real: 0 revisiones financieras persistidas.
- Métrica primaria: revisiones financieras únicas y distribución revisado/diferido/no aplica.
- Gate E2: calibrar al menos 20 decisiones humanas antes de usar esta señal como evidencia robusta de desempeño/adopción.
- Impacto económico: no medido todavía. No se atribuye ahorro por exposición, monto revisado ni cobertura.
- Siguiente medición: incorporar tiempo observado de revisión y luego comparar contra baseline manual para estimar horas evitadas con evidencia.


## 2026-10-25 — Latencia de decisión Finanzas

- Métrica añadida: latencia observada entre la carga del cockpit financiero y la decisión humana sobre una prioridad Laudus.
- Persistencia: `audit_log` con `action=finance_review_decision`, factura externa como identificador y `decision_latency_ms` en JSONB.
- Seguridad semántica: esta métrica no es todavía “tiempo ahorrado” ni baseline manual; sólo mide latencia observada dentro de MOTIL.
- Antirruido: se descartan latencias mayores a 30 minutos y el scorecard usa una muestra única por factura.
- Uso comercial futuro: comparar esta distribución contra un baseline manual cronometrado para cuantificar capacidad administrativa recuperada.


## 2026-10-25 — Baseline manual de revisión financiera

- Herramienta añadida en `Valor MOTIL`: cronómetro explícito para medir revisiones realizadas manualmente en Laudus, sin asistencia MOTIL.
- Unidad recomendada: 5 documentos por muestra.
- Persistencia: `audit_log` con duración total, cantidad de casos y segundos por caso.
- Límites: 10 segundos a 60 minutos por muestra; 1 a 20 casos.
- Métrica ejecutiva: mediana de segundos manuales por caso.
- Regla de valor: baseline manual y latencia MOTIL se muestran separados hasta contar con muestras suficientes. La diferencia no se convierte automáticamente en ahorro monetario.
- Próximo gate: obtener al menos 3 muestras manuales y 20 decisiones asistidas únicas antes de reportar capacidad administrativa recuperada.


## 2026-10-25 — Gate de reducción observada de tiempo

- Comparación habilitada sólo con ≥3 muestras de baseline manual y ≥20 decisiones asistidas con latencia válida.
- Fórmula: `(mediana_manual - mediana_asistida) / mediana_manual`.
- La métrica se presenta como reducción observada de tiempo, no como ahorro CLP.
- Valores negativos se conservan: si MOTIL demora más, el resultado debe mostrarlo en vez de ocultarlo.


## 2026-10-25 — Control preventivo factura ↔ orden de compra

- Problema previo: Finanzas puede conocer la obligación abierta, pero no tiene una capa operativa que sugiera qué OC revisar antes de pagar.
- Capacidad: MOTIL analiza las 25 obligaciones Laudus de mayor saldo y busca OCs candidatas mediante proveedor exacto, producto/SKU, ventana temporal de 180 días, cantidad y precio.
- Seguridad: read-only; no aprueba pagos, no modifica Laudus y no muta el canónico.
- Cobertura histórica exploratoria: 2.037 facturas con líneas; 1.837 encontraron al menos una OC candidata (90,2%) en el universo histórico con detalle.
- Cobertura del universo abierto: 1.183 obligaciones abiertas/parciales; 99 cuentan hoy con líneas detalladas en staging; 69 encontraron candidata en la exploración read-only.
- Hallazgo de calidad: el universo abierto todavía no produjo candidatos suficientemente separados para auto-sugerencia fuerte bajo el gate estricto. Por eso todos los casos permanecen sujetos a revisión humana.
- Diferencia bruta exploratoria: no se trata como ahorro, error ni impacto E3. Puede contener parcialidades, impuestos, múltiples OCs u otras diferencias legítimas.
- Nivel actual: L3 inteligencia candidata; objetivo L4 cuando la revisión humana confirme o rechace la relación factura-OC.
- Evidencia actual: E1/E2 de cobertura y comportamiento del matcher; E3 sólo cuando una diferencia se corrija antes del pago y el resultado económico quede demostrado.
- Siguiente medición: aceptación/rechazo del candidato, motivo, corrección resultante y monto efectivamente corregido antes del pago.


## 2026-10-25 — Trazabilidad nativa Laudus como evidencia primaria

- Swagger oficial Laudus v2 verificado en vivo: las facturas exponen `GET /purchases/invoices/{purchaseInvoiceId}`, `traceTo` y `traceFrom`.
- `PurchaseInvoiceItemDto` contiene `traceFrom[]` a nivel de línea; el documento también permite consultar los documentos que lo originaron.
- Jerarquía de evidencia: traza nativa de línea > traza nativa de documento > matcher determinístico > evidencia insuficiente.
- Primera implementación: máximo 5 facturas prioritarias sin detalle staged y máximo 10 llamadas read-only por evaluación.
- Confirmación de OC: sólo cuando el ID nativo trazado coincide exactamente con `integration.laudus_purchase_orders.external_id` del mismo tenant.
- No se interpreta `fromStep/toStep` sin evidencia documental adicional; códigos desconocidos permanecen sin clasificar.
- No hay persistencia en esta fase; la fuente se consulta como preview y no modifica Laudus ni MOTIL.
- Valor: aumenta precisión y auditabilidad del control previo al pago sin depender de inferencia cuando Laudus ya conoce la relación documental.


## 2026-10-25 — Cockpit interno de valor generado

- Alcance: visible sólo para `admin/superadmin`; no se incorpora al cockpit operativo de Daniel ni a usuarios de Finanzas.
- Objetivo: permitir a N3uralia medir valor acumulado de MOTIL para pricing, renovación y expansión sin contaminar la UX del cliente.
- Verde permitido únicamente para:
  - valor económico E3 observado;
  - reducción observada de tiempo cuando el gate tenga ≥3 baselines manuales y ≥20 decisiones asistidas cronometradas;
  - capacidad administrativa recuperada calculada sólo sobre casos efectivamente revisados y con el mismo gate.
- Contexto neutral:
  - monto bajo control financiero = suma de obligaciones con decisión humana registrada.
  - Este monto nunca se presenta como ahorro, costo evitado ni ROI.
- Estado inicial verificado en Supabase: 0 decisiones financieras cronometradas y 0 muestras de baseline manual al momento de instrumentar esta capa.
- Siguiente evidencia necesaria: uso real. El sistema está preparado para que los indicadores cambien automáticamente cuando existan decisiones y baselines suficientes.


## 2026-10-25 — Mantención: trazabilidad operacional medida

- Estado productivo observado al instrumentar: 11 OT; 10 con cronómetro a nivel de segundo; 74.560 segundos de ejecución acumulada (20,7 h); 220 eventos de OT; 9 OT cerradas.
- Cobertura de cronómetro: 90,9% del universo de OT observado.
- Clasificación interna: L4 / E2 para el flujo de OT instrumentado.
- Valor ya demostrado: control y trazabilidad de ejecución, actor, tiempo y cierre.
- No demostrado todavía: horas ahorradas, downtime evitado, ahorro CLP, mejora MTTR atribuible o costo evitado.
- Gate E3: comparar outcomes reales entre cohortes/períodos con evidencia suficiente (MTTR, reincidencia, downtime, costo posterior o tiempo administrativo) y registrar la intervención MOTIL que precedió al cambio.
- Siguiente medición: capturar baseline de gestión manual/administrativa y outcome post-cierre por activo/OT; priorizar reincidencia y tiempo desde creación → inicio → cierre por ser variables ya trazables.


## 2026-10-25 — Mantención: cobertura inter-área

- Flujo observado: 11 OT presentes en `work_order_supply_chain_v1`.
- Evidencia Bodega: 1 OT con requerimiento de material; 1 con shortage.
- Evidencia Compras: 0 solicitudes de compra y 0 OC originadas desde el flujo observado.
- Evidencia Finanzas: 0 compromiso de compra trazado desde OT en esta muestra.
- Lectura C interna: Mantención y Bodega ya comparten evidencia real; Compras y Finanzas aún no forman una cadena operativa cerrada.
- Regla: un dominio sólo cuenta como conectado cuando existe evidencia transaccional real. Tener el módulo o la integración disponible no eleva C.
- Siguiente salto de valor: material shortage de OT -> solicitud de compra -> OC -> recepción/instalación -> costo final de OT -> validación financiera.


## 2026-10-25 — Mantención: baseline de ciclo ejecutado

- 10 OT tienen evidencia suficiente para medir primer `timer_play` → `work_order_closed`.
- Mediana observada actual: 10.259,6 segundos ≈ 2,85 h.
- Uso: baseline E2 para comparar cohortes/períodos futuros.
- No usar como ahorro ni mejora atribuible hasta contar con comparación temporal y outcome.
- Creación → primer inicio no se usa todavía como tiempo de respuesta: la muestra mezcla planificación con fecha de creación y requiere semántica adicional antes de promoverla como KPI.


## 2026-10-25 — Mantención: baseline de reincidencia y handoff a Compras

- Reincidencia 7d observada: 4 OT cerradas ya tienen ventana madura de 7 días; 1 tuvo una nueva OT sobre el mismo activo dentro de esa ventana.
- Baseline inicial: 25% sobre muestra n=4. Clasificación E2; muestra insuficiente para atribución causal o conclusión de calidad de reparación.
- Handoff supply: el sistema ya crea/actualiza necesidad de abastecimiento al registrar requerimientos y detectar shortage.
- Autoridad humana preservada: convertir la necesidad a solicitud operativa de Compras requiere una acción explícita; MOTIL no compra automáticamente.
- Métrica C/E siguiente: tiempo desde primer evento `supply_need_refreshed` hasta `procurement_intake_created`, sólo cuando exista un handoff real.
- Gate E3 de Mantención: comparar reincidencia, ciclo de ejecución o downtime en cohortes/períodos con evidencia suficiente y una intervención MOTIL identificable.


## 2026-10-25 — Mantención: planificación semanal asistida de Ariel

- Problema previo: la planificación preventiva mezclaba horizonte largo, horómetros, señales históricas, materiales y generación de OT en una misma superficie; Ariel debía reconstruir manualmente qué requería decisión esta semana.
- Capacidad: MOTIL prepara una cola semanal de hasta 12 decisiones P1–P4 usando prioridad operacional, OT abiertas/programadas, planes estándar, evidencia de lectura y faltantes reales de materiales.
- Ventana operacional: próximos 7 días. El horizonte de recursos de 45 días se conserva sólo como contexto de planificación y no convierte trabajo futuro en programado esta semana.
- Frescura: una señal por horómetro con más de 30 días desde la lectura queda marcada `Actualizar evidencia` y no compite como decisión semanal vigente.
- Materiales: `parts_status_raw` del maestro histórico se conserva sólo como evidencia de fuente. Un bloqueo por materiales exige `quantity_shortage > 0` en requerimientos actuales de una OT real.
- Decisión humana: MOTIL propone `Abrir OT`, `Revisar plan` o `Programar`; Ariel mantiene autoridad para programar, corregir, aprobar y priorizar.
- Nivel actual: V3/L4 + E2. Ya existe priorización explicable y preparación de decisión, pero todavía no existe baseline manual suficiente para declarar horas ahorradas.
- Evidencia automática disponible por ciclo: decisiones preparadas, críticas P1/P2, programadas dentro de 7 días, bloqueos reales por materiales, planes MOTIL pendientes de revisión y señales retenidas por evidencia antigua.
- Gate E3: medir tiempo de preparación/revisión semanal antes y después de uso real, tasa de aceptación/corrección de las propuestas y outcomes de ejecución (cumplimiento, faltantes, ciclo y reincidencia).
- Valor comercial futuro: demostrar capacidad de planificación recuperada y menor dependencia de reconstrucción manual, sin convertir cantidad de alertas o casos priorizados en ahorro.


## 2026-10-27 — Mantención: cobertura de evidencia y gate LECTER

- Universo operacional observado en `maintenance_work_orders`: 21 OT creadas con identidad operativa.
- Responsable asignado: 21/21 (100%).
- Equipo asociado: 21/21 (100%).
- Cronómetro utilizado: 12/21 (57%).
- Causa raíz registrada: 10/21 (48%).
- Acción preventiva registrada: 9/21 (43%).
- Horómetro registrado en OT: 0/21 (0%).
- OT cerradas: 9/21.
- OTe reales observadas al momento de la medición: 0; el flujo acaba de entrar a producción y se medirá como cohorte separada.
- Tiempo medio cronometrado cuando existe registro: 115,4 minutos. Es tiempo observado de ejecución, no ahorro.
- Tiempo medio creación → cierre entre las 9 OT cerradas: 72,48 horas. Incluye espera/proceso y no se interpreta como duración mecánica.
- Clasificación LECTER actual: L4 / E2 / V4.
- Atribución económica: NO MEDIBLE AÚN.
- Pricing readiness: MARKET_ANCHORED.
- Gate para avanzar a E3/V5: medir minutos administrativos por OT antes de MOTIL versus con MOTIL sobre cohortes comparables.
- Regla de Numerin: toda cobertura publica numerador y denominador; ausencia de horómetro se mantiene como 0 observado, no se reemplaza por una inferencia.
- Diseño: el cockpit existente `/dashboard/valor` se amplía; no se crea un segundo dashboard ni una segunda fuente maestra.


## 2026-10-27 — Mantención: baseline administrativo manual instrumentado

- Se añadió un baseline explícito para cronometrar administración manual de OT fuera de MOTIL.
- Alcance: abrir, asignar, documentar, actualizar y cerrar administrativamente una OT por el método manual.
- Exclusión obligatoria: no incluye reparación mecánica ni tiempo técnico de ejecución.
- Persistencia: `audit_log`, acción `maintenance_admin_manual_baseline`.
- Evidencia por muestra: duración total, número de OT y segundos administrativos por OT.
- Gate inicial: mínimo 3 muestras comparables antes de usar la mediana como baseline operativo.
- Seguridad: visible y registrable sólo desde el cockpit interno admin/superadmin; no altera OT ni datos canónicos.
- Próximo paso: instrumentar una métrica equivalente del tiempo administrativo dentro de MOTIL para comparar baseline manual vs flujo asistido sin mezclar tiempo de reparación.


## 2026-10-27 — Mantención: timing asistido comparable

- Se instrumentó la creación de OT desde la primera interacción activa en el formulario hasta la creación exitosa.
- Persistencia: `audit_log`, acción `maintenance_ot_create_interaction`, una muestra por OT creada sin replay idempotente.
- Límite de calidad: se aceptan duraciones de 1 segundo a 30 minutos; fuera de ese rango no se promueven como muestra.
- Semántica: mide interacción activa de apertura, captura inicial y asignación; excluye reparación mecánica y espera.
- El baseline manual fue alineado al mismo alcance: apertura de OT, datos iniciales y asignación fuera de MOTIL.
- Gate de comparación: ≥3 muestras manuales y ≥10 aperturas MOTIL instrumentadas.
- Fórmula: `(mediana_manual - mediana_motil) / mediana_manual`.
- Valores negativos se conservan; si MOTIL tarda más, debe mostrarse.
- No se monetiza esta reducción hasta contar con costo/hora cargado válido, período comparable y suficiente atribución.
- Investigación de diseño: arXiv:2609.07984 respalda event logs orientados a acción gobernada; arXiv:2509.08482 refuerza que las características del log afectan la evaluación y no deben confundirse con causalidad.


## 2026-10-27 — OTe: cadena de evidencia desde detección a aprobación

- La OTe exige hora de detección informada explícitamente por el operador.
- MOTIL no infiere la detección a partir de la hora de creación.
- Persistencia: `work_order_events.event_type = emergency_detected`, con `event_at` igual a la hora informada y actor trazable.
- Validación: no acepta detección futura y limita retroactividad a 30 días.
- Tramos medidos por cohorte OTe:
  1. detección -> registro;
  2. registro -> primer `timer_play`;
  3. primer inicio -> cierre;
  4. cierre -> aprobación humana;
  5. detección -> aprobación.
- La aprobación proviene de `work_order_supervisor_reviews.status = approved` y `reviewed_at`.
- Cada tramo publica muestra y mediana sólo cuando existen ambos timestamps; ausencia de evidencia queda sin medir.
- No se interpreta ninguno de estos tiempos como downtime evitado, ahorro o impacto causal.
- Objetivo de evidencia: construir desde la primera OTe una cohorte comparable para evaluar velocidad de respuesta, completitud de cierre y disciplina de aprobación.

## 2026-10-29 — Separación formal entre UAT y evidencia operacional de adjudicación

- Hallazgo cuantitativo: existe 1 decisión de adjudicación y 1 outcome asociado, pero la propia nota de decisión declara que fue un UAT productivo controlado y que no representa una compra real.
- Cifra correcta para valor operacional: 0 adjudicaciones operacionales válidas y 0 outcomes operacionales válidos. El UAT se conserva como evidencia de funcionamiento, no como adopción ni ROI.
- Arquitectura: `procurement_award_decisions` incorpora `evidence_scope` con valores `operational|uat`, default operacional; el UAT histórico conocido queda backfilleado por ID y nota exacta.
- `procurement_award_outcomes_v1` conserva ambos scopes; `procurement_award_outcome_summary_v1` agrega únicamente evidencia operacional.
- El scorecard publica `totalDecisions`, `operationalDecisions`, `uatDecisions` y outcomes operacionales por separado. Si no existe muestra operacional, el gate queda `NO_OPERATIONAL_SAMPLE` y evidencia E0.
- Valor: evita inflar adopción, desempeño o ROI con pruebas de sistema. El primer gate comercial real será una adjudicación operacional humana con outcome posterior trazable.
