-- One source row per WhatsApp message. Read-only, security invoker and tenant RLS.
-- Status categories are mutually exclusive by precedence; do not treat all
-- messages without module updates as failed: many are contextual/social.
CREATE OR REPLACE VIEW public.motil_whatsapp_ingestion_reconciliation_v1
WITH (security_invoker = true) AS
SELECT m.organization_id,m.id AS message_id,m.group_id,m.occurred_at,m.message_type,
       CASE
         WHEN EXISTS (SELECT 1 FROM public.motil_whatsapp_module_updates_v1 u
                      WHERE u.organization_id=m.organization_id AND u.message_id=m.id)
           THEN 'operational_update'
         WHEN EXISTS (SELECT 1 FROM public.motil_whatsapp_intake_exceptions_v1 e
                      WHERE e.organization_id=m.organization_id AND e.message_id=m.id
                        AND e.disposition='media_processing_issue')
           THEN 'media_exception'
         WHEN EXISTS (SELECT 1 FROM public.motil_whatsapp_intake_exceptions_v1 e
                      WHERE e.organization_id=m.organization_id AND e.message_id=m.id)
           THEN 'other_exception'
         ELSE 'unreconciled_source'
       END AS reconciliation_status,
       EXISTS (SELECT 1 FROM public.motil_whatsapp_intake_exceptions_v1 e
               WHERE e.organization_id=m.organization_id AND e.message_id=m.id) AS has_exception,
       false AS changes_canonical_kpis
FROM public.motil_whatsapp_messages m;
COMMENT ON VIEW public.motil_whatsapp_ingestion_reconciliation_v1 IS
'One row per source WhatsApp message; read-only and no inference of canonical promotion.';

CREATE OR REPLACE VIEW public.motil_whatsapp_media_recovery_queue_v1
WITH (security_invoker = true) AS
SELECT e.organization_id,e.message_id,e.group_id,e.group_name,e.occurred_at,
       e.attachment_count,e.problematic_attachment_count,e.registry_state,
       m.message_type,m.file_name,m.provider_message_id,
       a.download_status,a.scan_status,a.download_error_code,a.scan_error_code,
       CASE WHEN a.download_status='stored' AND a.scan_status='manual' THEN 'manual_scan_review'
            WHEN a.download_status='unavailable' THEN 'source_download_unavailable'
            WHEN a.download_status='unsupported' THEN 'unsupported_source'
            ELSE 'inspect_attachment_state' END AS recovery_route
FROM public.motil_whatsapp_intake_exceptions_v1 e
JOIN public.motil_whatsapp_messages m
 ON m.id=e.message_id AND m.organization_id=e.organization_id
LEFT JOIN public.motil_whatsapp_attachments a
 ON a.message_id=e.message_id AND a.organization_id=e.organization_id
WHERE e.disposition='media_processing_issue';
COMMENT ON VIEW public.motil_whatsapp_media_recovery_queue_v1 IS
'Recovery candidates only; never mark media recovered without provider/storage verification.';
