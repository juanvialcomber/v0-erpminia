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
