CREATE OR REPLACE VIEW public.motil_whatsapp_caption_priority_notices_v1 WITH (security_invoker=true) AS
WITH candidates(message_id,issue_type) AS (VALUES
 (273864::bigint,'equipment_stop'),(274112::bigint,'equipment_fault'),
 (260145::bigint,'return_to_service'),(400207::bigint,'return_to_service'),
 (308084::bigint,'ambiguous_reading'),(16804::bigint,'maintenance_work_reported'),
 (17093::bigint,'inspection_reported'))
SELECT m.organization_id,m.id AS message_id,m.group_id,m.occurred_at,
 m.body AS source_text,c.issue_type,
 'planner_or_area_review_required'::text AS review_status,
 false AS authorized_to_create_work_order,false AS canonical_promotion
FROM candidates c JOIN public.motil_whatsapp_messages m ON m.id=c.message_id
WHERE NULLIF(BTRIM(m.body),'') IS NOT NULL;
COMMENT ON VIEW public.motil_whatsapp_caption_priority_notices_v1 IS 'Evidence-only candidate notices. No inferred downtime, OT or automatic promotion.';
