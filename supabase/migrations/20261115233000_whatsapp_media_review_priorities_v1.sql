-- Evidence-only attachment view. Do not OCR, transcribe or scan photos/videos.
-- Preserve message text/caption as the primary operational interpretation.
CREATE OR REPLACE VIEW public.motil_whatsapp_media_review_priorities_v1
WITH (security_invoker = true) AS
SELECT a.organization_id,a.id AS attachment_id,a.message_id,a.group_id,
       a.provider_message_id,a.mime_type,a.sha256,a.storage_path,
       a.scan_status,a.scan_error_code,a.downloaded_at,m.occurred_at,
       m.body AS associated_message_text,m.quoted_message_id,
       q.body AS quoted_message_text,
       CASE WHEN NULLIF(BTRIM(m.body),'') IS NOT NULL
            THEN 'text_with_media_evidence'
            WHEN NULLIF(BTRIM(q.body),'') IS NOT NULL
            THEN 'quoted_text_with_media_evidence'
            ELSE 'media_evidence_only' END AS review_route,
       2 AS review_priority,
       'evidence_archived'::text AS review_state,
       false AS canonical_promotion
FROM public.motil_whatsapp_attachments a
JOIN public.motil_whatsapp_messages m
 ON m.id=a.message_id AND m.organization_id=a.organization_id
LEFT JOIN public.motil_whatsapp_messages q
 ON q.organization_id=m.organization_id AND q.provider_message_id=m.quoted_message_id
 AND q.group_id=m.group_id
WHERE a.download_status='stored'
  AND a.scan_status='manual'
  AND EXISTS (
    SELECT 1 FROM public.motil_whatsapp_intake_exceptions_v1 e
    WHERE e.message_id=a.message_id AND e.organization_id=a.organization_id
      AND e.disposition='media_processing_issue'
  );
COMMENT ON VIEW public.motil_whatsapp_media_review_priorities_v1 IS
'Stored photos/videos are evidence, not OCR tasks; keep original associated WhatsApp text and source identity.';
