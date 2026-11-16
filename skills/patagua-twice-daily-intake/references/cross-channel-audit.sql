-- MOTIL / La Patagua: auditoría multicanal de solo lectura.
-- Ejecutar antes de desarrollar la promoción automática. No modifica tablas ni horómetros.
-- Una coincidencia por activo y fecha es CANDIDATA, nunca duplicado confirmado:
-- WhatsApp registra actividades; el correo de esta etapa registra horómetros.
WITH email AS (
 SELECT organization_id,candidate_asset_id AS asset_id,report_date,
        count(*) AS email_readings,count(DISTINCT source_file_sha256) AS email_files
 FROM public.motil_email_equipment_meter_stage
 WHERE candidate_asset_id IS NOT NULL
 GROUP BY 1,2,3
), whatsapp AS (
 SELECT organization_id,canonical_asset_id AS asset_id,operation_date,
        count(*) AS whatsapp_activities,count(DISTINCT message_id) AS whatsapp_messages
 FROM public.motil_whatsapp_module_feed_v2
 WHERE canonical_asset_id IS NOT NULL
 GROUP BY 1,2,3
)
SELECT e.organization_id,e.asset_id,e.report_date,
       e.email_readings,e.email_files,w.whatsapp_activities,w.whatsapp_messages,
       'REVIEW_REQUIRED_DIFFERENT_FACT_TYPES' AS reconciliation_status
FROM email e
JOIN whatsapp w
 ON w.organization_id=e.organization_id
 AND w.asset_id=e.asset_id
 AND w.operation_date=e.report_date
ORDER BY e.report_date DESC,e.asset_id;

-- Cobertura por canal. Revisar periodos antes de declarar ausencia de duplicados.
SELECT 'email_meter_stage' AS source,count(*) AS records,
 count(*) FILTER (WHERE candidate_asset_id IS NOT NULL) AS linked,
 min(report_date) AS first_date,max(report_date) AS last_date
FROM public.motil_email_equipment_meter_stage
UNION ALL
SELECT 'whatsapp_module_feed',count(*),
 count(*) FILTER (WHERE canonical_asset_id IS NOT NULL),
 min(operation_date),max(operation_date)
FROM public.motil_whatsapp_module_feed_v2;

-- Política: NO deduplicar actividades con horómetros por compartir activo/fecha.
-- Para cada dominio definir identity key + metric kind + unidad + turno + fecha efectiva.
-- El correo semanal debe cotejarse por fecha efectiva de cada fila, NO por fecha de envío.
-- Si hay diferencias: preservar ambas evidencias, dejar en revisión, no actualizar KPI.
