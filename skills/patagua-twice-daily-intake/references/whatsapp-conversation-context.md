# Interpretación contextual de WhatsApp La Patagua

## Regla principal
La unidad de interpretación es el **episodio operacional**, no el mensaje aislado. El grupo de WhatsApp aporta contexto de faena, proceso, responsables y propósito; nunca es por sí solo prueba de destino. Usar juntos grupo + secuencia conversacional + mensaje + adjuntos + fecha/turno + documentos relacionados.

## Secuencia obligatoria
1. Confirmar organización, grupo habilitado, remitente, fecha efectiva y orden temporal.
2. Leer el mensaje original completo, respuestas citadas y mensajes inmediatamente relacionados del mismo grupo/turno; identificar si una foto/documento continúa una explicación previa o si la explicación llega después.
3. Reconocer la finalidad del grupo: `Grupo 2` suele reunir reportes de faenas, operaciones y evidencias transversales; `Planta Patagua` aporta contexto de planta pero también puede contener leyes químicas, logística o mantenimiento; `Programación Despacho Concentrado CMLP` aporta programación y documentación de despacho, sin asumir ejecución.
4. Leer títulos, unidades, muestras, encabezados y contenido del adjunto; no interpretar una fotografía por el nombre del grupo solamente.
5. Extraer el hecho con su contexto: área/faena, proceso, turno/fecha, acción ejecutada vs planificada, muestra/lote/viaje/activo cuando aplique, cantidad/unidad, y evidencia de respaldo.
6. Distinguir un mensaje que reporta hechos de otro que solo los comenta, reenvía, corrige, confirma o adjunta evidencia. Vincularlos al mismo episodio sin duplicar actividad.
7. Contrastar con correos `@lapatagua.cl`, Excel y datos canónicos de la misma fecha y dominio. Si hay conflicto, registrar ambas versiones y pedir validación solo cuando cambie una decisión material.
8. Enrutar al módulo dueño del **hecho**, conservando grupo y conversación como procedencia. No imponer `canonical_asset_id` a leyes, procesos, turnos, viajes agregados o despacho.
9. Guardar `reason_for_route`, referencias a mensajes/adjuntos, nivel de confianza, `requires_review` y distinción entre `Última señal` y `Estado validado`.

## Ejemplos verificables
- `Grupo 2` + reporte de Mina Peumo -> Producción > Mina > Peumo.
- `Grupo 2` + fotografía de leyes de planta -> Laboratorio/Metalurgia, no Mina.
- `Planta Patagua` + foto de leyes de concentrado -> Laboratorio/Metalurgia, no operación de planta.
- `Planta Patagua` + retiro de motores de salvataje -> logística/mantenimiento según destino y acción, no transporte de mineral.
- `Programación Despacho Concentrado CMLP` + dos camiones programados -> Despacho > Planificación, no despacho ejecutado.

## Reglas de seguridad
No asociar fotos por proximidad temporal solamente; exigir continuidad de hilo, autor, tema, turno o referencia explícita. No promover cifras de imágenes sin lectura verificable. No generar OT ni alterar KPI automáticamente por un mensaje. Mantener mensajes ambiguos como evidencia en revisión, nunca descartarlos ni inventar su destino.
