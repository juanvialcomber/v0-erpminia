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
