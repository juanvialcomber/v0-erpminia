-- Read-only bridge between classified source captions and existing operational records.
-- Does not publish production figures, create work orders, or overwrite evidence.
CREATE OR REPLACE VIEW public.motil_whatsapp_caption_operational_reconciliation_v1
WITH (security_invoker = true) AS
SELECT c.organization_id,c.message_id,c.group_id,c.occurred_at,
       c.source_text,c.candidate_destination,c.proposed_status,
       EXISTS (
         SELECT 1 FROM public.motil_whatsapp_operational_activities a
         WHERE a.organization_id=c.organization_id AND a.message_id=c.message_id
       ) AS has_operational_activity,
       EXISTS (
         SELECT 1 FROM public.motil_whatsapp_review_decisions d
         WHERE d.organization_id=c.organization_id AND d.message_id=c.message_id
       ) AS has_review_decision,
       EXISTS (
         SELECT 1 FROM public.motil_whatsapp_module_updates_v1 u
         WHERE u.organization_id=c.organization_id AND u.message_id=c.message_id
       ) AS has_module_update,
       CASE WHEN EXISTS (
         SELECT 1 FROM public.motil_whatsapp_operational_activities a
         WHERE a.organization_id=c.organization_id AND a.message_id=c.message_id
       ) OR EXISTS (
         SELECT 1 FROM public.motil_whatsapp_module_updates_v1 u
         WHERE u.organization_id=c.organization_id AND u.message_id=c.message_id
       ) THEN 'linked_to_operational_record'
       ELSE 'source_text_pending_reconciliation'
       END AS reconciliation_status,
       false AS canonical_promotion
FROM public.motil_whatsapp_caption_triage_20261115_v1 c;
COMMENT ON VIEW public.motil_whatsapp_caption_operational_reconciliation_v1 IS
'Operational caption linkage check, tenant scoped and read-only; no automatic canonical updates.';
