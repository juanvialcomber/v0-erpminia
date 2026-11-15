-- Deterministic source-text triage of 73 media-caption messages as of 2026-11-15.
-- No photo/video processing, no canonical promotion and no automatic OT.
-- Source IDs are tenant-scoped through the join; newly arriving messages are not auto-classified.
CREATE OR REPLACE VIEW public.motil_whatsapp_caption_triage_20261115_v1
WITH (security_invoker = true) AS
WITH classified(message_id, destination) AS (VALUES
(12804::bigint,'turnos'),
(20095::bigint,'turnos'),
(194543::bigint,'turnos'),
(278821::bigint,'turnos'),
(285769::bigint,'turnos'),
(298910::bigint,'turnos'),
(309824::bigint,'turnos'),
(16804::bigint,'chancado'),
(17093::bigint,'chancado'),
(24849::bigint,'chancado'),
(39434::bigint,'chancado'),
(70125::bigint,'chancado'),
(142521::bigint,'chancado'),
(216883::bigint,'chancado'),
(260145::bigint,'chancado'),
(274356::bigint,'chancado'),
(274357::bigint,'chancado'),
(274358::bigint,'chancado'),
(274359::bigint,'chancado'),
(274360::bigint,'chancado'),
(298169::bigint,'chancado'),
(298170::bigint,'chancado'),
(298172::bigint,'chancado'),
(298173::bigint,'chancado'),
(298175::bigint,'chancado'),
(298177::bigint,'chancado'),
(298179::bigint,'chancado'),
(351438::bigint,'chancado'),
(366062::bigint,'chancado'),
(381710::bigint,'chancado'),
(407380::bigint,'chancado'),
(417915::bigint,'chancado'),
(430551::bigint,'chancado'),
(444103::bigint,'chancado'),
(456406::bigint,'chancado'),
(468974::bigint,'chancado'),
(72594::bigint,'molienda'),
(72951::bigint,'molienda'),
(73131::bigint,'molienda'),
(184587::bigint,'molienda'),
(273864::bigint,'molienda'),
(274604::bigint,'molienda'),
(284525::bigint,'molienda'),
(298165::bigint,'molienda'),
(308084::bigint,'molienda'),
(381708::bigint,'molienda'),
(456403::bigint,'molienda'),
(69956::bigint,'flotacion'),
(87918::bigint,'flotacion'),
(273868::bigint,'flotacion'),
(274112::bigint,'flotacion'),
(281550::bigint,'flotacion'),
(281796::bigint,'flotacion'),
(298184::bigint,'flotacion'),
(306100::bigint,'flotacion'),
(400199::bigint,'flotacion'),
(400207::bigint,'flotacion'),
(407397::bigint,'flotacion'),
(74562::bigint,'filtrado'),
(282048::bigint,'filtrado'),
(483365::bigint,'filtrado'),
(273867::bigint,'laboratorio'),
(274852::bigint,'laboratorio'),
(288493::bigint,'laboratorio'),
(288593::bigint,'laboratorio'),
(298182::bigint,'laboratorio'),
(407919::bigint,'laboratorio'),
(355283::bigint,'agua'),
(355284::bigint,'agua'),
(355286::bigint,'agua'),
(355287::bigint,'agua'),
(95199::bigint,'seguridad'),
(381706::bigint,'mantenimiento')
)
SELECT m.organization_id,m.id AS message_id,m.group_id,m.occurred_at,
       m.body AS source_text,c.destination AS candidate_destination,
       CASE WHEN c.destination IN ('chancado','molienda','flotacion','filtrado','laboratorio','agua','mantenimiento')
            THEN 'domain_review_required' ELSE 'context_only' END AS proposed_status,
       false AS canonical_promotion
FROM classified c
JOIN public.motil_whatsapp_messages m ON m.id=c.message_id
WHERE NULLIF(BTRIM(m.body),'') IS NOT NULL
AND EXISTS (SELECT 1 FROM public.motil_whatsapp_intake_exceptions_v1 e
 WHERE e.message_id=m.id AND e.organization_id=m.organization_id
 AND e.disposition='media_processing_issue');
COMMENT ON VIEW public.motil_whatsapp_caption_triage_20261115_v1 IS
'73 human-readable caption classifications, source preserved, review required for consequential updates.';
