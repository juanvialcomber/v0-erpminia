# Siete avisos prioritarios — verificación de evidencia

Corte: 2026-11-15. Supabase producción, consultas read-only.

IDs: 16804, 17093, 260145, 273864, 274112, 308084, 400207.

- Los siete existen en `motil_whatsapp_message_registry_v1`, todos con `registry_state=evidence_archived`, `activity_count=0`, `published_count=0` y `exception_count=0` en el registro. El valor `exception_count=0` no contradice el estado de `problematic_attachment_count=1` para cada uno: son métricas distintas.
- Cada mensaje tiene un adjunto. Cinco adjuntos están almacenados; los de IDs 17093 y 400207 no figuran como almacenados. No solicitar OCR ni inferir contenido visual.
- Ninguno de los siete tiene coincidencia exacta de su ID en `motil_whatsapp_daily_reports.findings[].source_ids`.
- Ninguno tiene actividad operacional publicada en el registro consultado. Esto no prueba que el trabajo no exista por otra vía.

## Decisión

Mantener los siete como avisos candidatos de revisión de área/planificador. No crear OT, asignar activo, inferir horas de detención ni actualizar KPIs. Priorizar los casos de parada/falla y las dos evidencias sin adjunto almacenado. La respuesta de Ariel debe resolver la autoridad de conversión a OT y las fuentes originales de los trabajos.

## Criterio de cierre

Registrar por ID: fuente, clasificación, estado de adjunto, enlace exacto a hallazgo, vínculo verificable a OT, decisión humana y motivo de descarte o promoción. Hasta entonces, HOLD de promoción canónica.
