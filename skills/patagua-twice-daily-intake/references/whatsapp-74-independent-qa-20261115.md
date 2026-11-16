# QA independiente — 74 mensajes antes de promoción
Veredicto: HOLD. Fuente: lectura de Supabase y artefacto de triage en rama de trabajo.

## Comprobado
- 74 IDs únicos, sin duplicados dentro del artefacto.
- Grupos habilitados: Planta Patagua 62, Programación Despacho Concentrado CMLP 6, Grupo 2 6.
- 22 mensajes de cortesía/enlaces/respuestas breves no deben convertirse automáticamente en hechos productivos; pueden aportar contexto a un hilo.
- Molino 8x48: 307844 informa F/S a las 10:00 por temperatura del descanso 6; 307845 informa E/S a las 11:30, ambos publicados el 04/11 a las 21:21 UTC. 322086 informa otra F/S a las 02:50 en mensaje del 05/11. No deducir que forman un único intervalo ni calcular duración sin fecha/turno verificados.
- Energía: 408947 y 408948 dicen causa desconocida, mientras 408949 atribuye el origen a Chilquinta. No declarar causa confirmada; preservar contradicción/cronología y buscar parte oficial.
- 485469 reporta instalación de poste principal N2 el 21/10; 485470 estima 21-22 días. No registrar vida útil verificada ni cambiar mantenimiento.
- 323327 texto truncado 'Buen día.Informa'; requiere hilo/adjunto.
- Todos los candidatos del archivo son `canonical_promotion:false`.

## Defectos/brechas
- P1 HOLD: clasificación basada en extractos de 450 caracteres y nombre de grupo; falta hilo completo y adjuntos.
- P1 HOLD: 74 se originan en una segunda lectura del artefacto; la cifra previa de 72 era una clasificación distinta. Reconciliar snapshot y reglas antes de presentar cobertura definitiva.
- P1 HOLD: sin verificación de OT, Excel, correo ni duplicados entre canales.
- P1 HOLD: migraciones de destino y vistas de señales todavía no ejecutadas en preview con RLS y UI.
- P2: no confundir texto social con 'fuente descartada'; conservar como contexto.

## Criterios de salida
Cada fuente con estado procesado/duplicado justificado/excepción, contexto completo, destino verificable, evidencia de no duplicación y permisos probados. Después preview exact-SHA, QA independiente y autorización de release.
