# Conciliación multicanal MOTIL — contrato operativo

## Objetivo
Consolidar hechos operacionales, no mensajes. WhatsApp, Gmail, Excel, Laudus y formularios aportan evidencia de un mismo hecho; la pantalla principal presenta el estado validado y la última señal por separado.

## Clasificar antes de buscar activos (regla obligatoria)
1. Leer mensaje completo, grupo, fecha efectiva, adjuntos y contexto cercano.
2. Determinar dominio y tipo de hecho según contenido; el grupo es una pista de procedencia, no el único clasificador.
3. Enviar leyes/muestras a Laboratorio o Metalurgia; mineral transportado y viajes a Producción/Transporte; despacho de concentrado a Despacho; chancado, molienda y flotación a Planta; relaves/aguas a Relaves; planificación a área responsable; novedades de maquinaria a Mina/Mantenimiento según naturaleza.
4. Exigir `canonical_asset_id` **solo** cuando el hecho necesita un activo para ser identificado (horómetro, falla, mantenimiento, estado de máquina). No marcar leyes, turnos, procesos, transporte agregado o documentos de despacho como `missing_asset`.
5. Distinguir `routing_status` de `asset_match_status`. Un mensaje bien enrutado sin activo es válido. `auto_published` no implica dato oficial aprobado.
6. En los registros de octubre 2026, `sin_clasificar` incluye reportes de Mina San Pedro, Peumo, Don Jaime y Raíz del Cobre procedentes de Grupo 2. Candidato de destino: Producción > Mina, conservando faena; validar el contenido antes de modificar la base.

## Clave de identidad del hecho
Determinar `organization_id + domain + operational_entity_or_process + effective_date_or_interval + metric_or_event_kind + unit + event_discriminator`. El identificador de activo es opcional según dominio. Para leyes, usar muestra/lote, fecha, analito, base y unidad; para transporte, origen/destino, viaje/guía/lote y fecha; para horómetros, activo, fecha/hora y unidad; para producción, faena, turno, proceso y producto. No deduplicar solo por texto, grupo, fecha de recepción ni equipo.

## Proceso
1. Capturar evidencia original con ID de proveedor, hash SHA256, fuente, remitente, archivo, hoja/fila y fecha efectiva.
2. Clasificar dominio, documento y destino; normalizar valores y unidades conservando los originales.
3. Resolver identidad de proceso, muestra, lote, viaje o activo según dominio. Si falta una clave **necesaria**, marcar `needs_review`; no exigir activo por defecto.
4. Generar `fact_fingerprint` estable solo con identidad determinística. Si dos fuentes reportan el mismo hecho, anexar evidencia, no sumar ni crear otra OT.
5. Comparar filas del Excel semanal por fecha efectiva y claves del dominio, no por fecha de envío.
6. Si difiere un valor, registrar conflicto con ambas fuentes, fechas y autoridad revisora; no sobrescribir silenciosamente.
7. Mostrar `Última señal` pendiente y `Estado validado` separadamente. Cada módulo incluye sección secundaria `Fuentes / WhatsApp`.

## Estados
`source_received`, `normalized`, `routed`, `matched`, `duplicate_evidence`, `conflict`, `needs_review`, `promoted`, `rejected`.

## Gate de implementación
- Inspeccionar esquema y ownership antes de agregar tablas o vistas.
- Implementar idempotencia por evidencia y hechos con identidades específicas del dominio.
- Probar: ley sin activo; transporte sin vehículo individual; mensaje de Mina sin equipo; reporte de equipo ambiguo; duplicado WhatsApp/Excel semanal; corrección; reenvío; aislamiento tenant.
- Reconciliar `fuentes elegibles = ingresadas + duplicadas justificadas + excepciones`.
- Branch, preflight, preview autenticado y QA antes de merge; no declarar ingesta completa desde un cron de solo frescura.
