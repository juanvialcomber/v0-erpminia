# Conciliación multicanal MOTIL — contrato operativo

## Objetivo
Consolidar hechos operacionales, no mensajes. WhatsApp, Gmail, Excel, Laudus y formularios aportan evidencia de un mismo hecho; la pantalla principal presenta el estado validado y la última señal por separado.

## Clave de identidad del hecho
Determinar `organization_id + domain + canonical_entity_id + effective_date_or_interval + metric_or_event_kind + unit + event_discriminator`. Para horómetros, usar activo canónico, fecha/hora efectiva y tipo de medición. Para producción, incluir faena, turno, proceso, producto y unidad. Para despacho, incluir guía/lote/camión/fecha cuando estén verificados. Nunca usar solamente similitud de texto, fecha de recepción ni nombre de WhatsApp.

## Proceso
1. Capturar evidencia original con ID de proveedor, hash SHA256, fuente, remitente, archivo, hoja/fila y fecha efectiva. Conservar incluso mensajes repetidos.
2. Normalizar valores y unidades sin destruir valores originales. Determinar identidad de activo/proceso por código, serie, patente o clave externa comprobada.
3. Generar `fact_fingerprint` estable solo para identidades determinísticas. Si faltan claves, marcar `needs_review` y no fusionar.
4. Comparar con hechos existentes por identidad y ventana operacional. Si valor y contexto son equivalentes, anexar nueva evidencia al mismo hecho; no sumar producción ni generar nueva OT.
5. Si el correo semanal reproduce mensajes previos, vincular cada fila del Excel con el hecho original por fecha operacional, entidad, turno y métrica; conservar ambas fuentes.
6. Si cambia el valor, registrar `conflict` con ambos valores, fechas, fuentes y responsable. Solo autoridad del área o regla aprobada puede promover una corrección.
7. Mostrar `Última señal` incluso si está pendiente, rotulada `Sin validar`; `Estado validado` nunca se altera sin promoción autorizada.
8. Cada módulo incluye enlace secundario `Fuentes / WhatsApp` con evidencia y trazabilidad, no un chat como vista principal.

## Estados
`source_received`, `normalized`, `matched`, `duplicate_evidence`, `conflict`, `needs_review`, `promoted`, `rejected`. Un estado de publicación de WhatsApp como `auto_published` NO significa dato canónico aprobado.

## Gate de implementación
- Examinar esquemas y ownership existentes; evitar una segunda tabla maestra o duplicar hechos ya canónicos.
- Construir ingesta idempotente y reconciliador incremental con clave única por evidencia; separar `fact` de `fact_evidence`.
- Backfill por ventana acotada y staging, sin escrituras oficiales de horómetros ni cambios de KPI hasta revisar.
- Pruebas obligatorias: mensaje y Excel semanal idénticos; corrección de valor; mismo equipo en dos fechas; dos equipos de igual modelo; mismo documento reenviado; dos faenas; adjunto faltante; aislamiento tenant; fechas Chile; reintento del cron.
- Verificar contabilidad: fuentes elegibles = ingresadas + duplicadas justificadas + excepciones.
- Branch, preflight, preview autenticado y QA antes de merge. No declarar sincronización automática completa si el worker Gmail solo lee manifiestos.
