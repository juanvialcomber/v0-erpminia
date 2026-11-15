-- Exact evidence linkage: daily-report finding source_ids, not date or text similarity.
-- Read-only; retains human review and does not promote canonical production facts.
CREATE OR REPLACE VIEW public.motil_whatsapp_caption_daily_finding_match_v1
WITH (security_invoker = true) AS
WITH finding_refs AS (
 SELECT r.organization_id,r.report_date,
        (s.value #>> '{}')::bigint AS source_message_id,
        f.value->>'domain' AS report_domain,
        f.value->>'detail' AS report_detail,
        f.value->>'review_status' AS report_review_status
 FROM public.motil_whatsapp_daily_reports r
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(r.findings)='array' THEN r.findings ELSE '[]'::jsonb END
 ) f
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN jsonb_typeof(f.value->'source_ids')='array'
        THEN f.value->'source_ids' ELSE '[]'::jsonb END
 ) s
 WHERE jsonb_typeof(s.value)='number'
)
SELECT c.organization_id,c.message_id,c.candidate_destination,c.occurred_at,
       c.source_text,fr.report_date,fr.report_domain,fr.report_detail,
       fr.report_review_status,
       CASE WHEN fr.source_message_id IS NOT NULL THEN 'already_cited_in_daily_report_pending_review'
            ELSE 'needs_source_reconciliation' END AS next_action_state,
       CASE WHEN fr.source_message_id IS NOT NULL
            THEN 'exact_daily_finding_source_link'
            ELSE 'no_exact_daily_finding_source_link' END AS evidence_link_status,
       false AS canonical_promotion
FROM public.motil_whatsapp_caption_triage_20261115_v1 c
LEFT JOIN finding_refs fr
 ON fr.organization_id=c.organization_id AND fr.source_message_id=c.message_id;
COMMENT ON VIEW public.motil_whatsapp_caption_daily_finding_match_v1 IS
'Exact source_ids matching of 73 WhatsApp captions to daily findings; no inferred duplicates or automatic canonical updates.';
