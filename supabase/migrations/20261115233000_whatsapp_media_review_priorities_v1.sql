-- Read-only review queue; no model invocation or production-state writes.
-- Preserve source identity and media hashes for deterministic deduplication.
CREATE OR REPLACE VIEW public.motil_whatsapp_media_review_priorities_v1
WITH (security_invoker = true) AS
SELECT a.organization_id,a.id AS attachment_id,a.message_id,a.group_id,
       a.provider_message_id,a.mime_type,a.sha256,a.storage_path,
       a.scan_status,a.scan_error_code,a.downloaded_at,m.occurred_at,
       CASE
         WHEN a.mime_type='image/jpeg' THEN 'photo_document_review'
         WHEN a.mime_type='video/mp4' THEN 'video_context_only'
         ELSE 'unsupported_or_other'
       END AS review_route,
       CASE
         WHEN a.mime_type='image/jpeg' THEN 1
         WHEN a.mime_type='video/mp4' THEN 2
         ELSE 3
       END AS review_priority,
       'pending_human_or_vision_review'::text AS review_state,
       false AS canonical_promotion
FROM public.motil_whatsapp_attachments a
JOIN public.motil_whatsapp_messages m
 ON m.id=a.message_id AND m.organization_id=a.organization_id
WHERE a.download_status='stored'
  AND a.scan_status='manual'
  AND EXISTS (
    SELECT 1 FROM public.motil_whatsapp_intake_exceptions_v1 e
    WHERE e.message_id=a.message_id AND e.organization_id=a.organization_id
      AND e.disposition='media_processing_issue'
  );
COMMENT ON VIEW public.motil_whatsapp_media_review_priorities_v1 IS
'Prioritized evidence-only review; no automatic OCR, OT creation or canonical promotion.';
