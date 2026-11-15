-- Read-only operational text queue. Photos/videos remain evidence only.
-- A caption is not a canonical production fact until validated by its domain.
CREATE OR REPLACE VIEW public.motil_whatsapp_media_text_reconciliation_v1
WITH (security_invoker = true) AS
SELECT m.organization_id,m.id AS message_id,m.group_id,m.provider_message_id,
       m.sender_name,m.occurred_at,m.body AS source_text,
       a.id AS attachment_id,a.mime_type,a.sha256,a.storage_path,
       CASE WHEN EXISTS (
         SELECT 1 FROM public.motil_whatsapp_module_updates_v1 u
         WHERE u.organization_id=m.organization_id AND u.message_id=m.id
       ) THEN 'already_represented'
       ELSE 'text_requires_domain_reconciliation' END AS text_reconciliation_status,
       false AS canonical_promotion
FROM public.motil_whatsapp_messages m
JOIN public.motil_whatsapp_attachments a
 ON a.message_id=m.id AND a.organization_id=m.organization_id
WHERE a.download_status='stored'
  AND NULLIF(BTRIM(m.body),'') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.motil_whatsapp_intake_exceptions_v1 e
    WHERE e.organization_id=m.organization_id AND e.message_id=m.id
      AND e.disposition='media_processing_issue'
  );
COMMENT ON VIEW public.motil_whatsapp_media_text_reconciliation_v1 IS
'Caption-first reconciliation without image OCR or automatic work-order creation.';
