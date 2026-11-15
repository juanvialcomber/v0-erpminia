-- Read-only operational backlog, not a command to auto-promote all messages.
-- Group by occurrence date; feed rows can contain multiple facts per message.
WITH message_coverage AS (
 SELECT m.id,m.occurred_at,m.message_type,m.group_id,
        EXISTS (SELECT 1 FROM public.motil_whatsapp_module_updates_v1 f
                WHERE f.organization_id=m.organization_id AND f.message_id=m.id) AS in_feed
 FROM public.motil_whatsapp_messages m
 WHERE m.occurred_at >= '2026-10-01'
)
SELECT date_trunc('week',occurred_at)::date AS week_start,
       count(*) AS source_messages,
       count(*) FILTER (WHERE in_feed) AS messages_in_feed,
       count(*) FILTER (WHERE NOT in_feed) AS without_feed,
       count(*) FILTER (WHERE NOT in_feed AND message_type IN ('textMessage','extendedTextMessage','quotedMessage')) AS text_review_candidates,
       count(*) FILTER (WHERE NOT in_feed AND message_type='imageMessage') AS image_review_candidates
FROM message_coverage GROUP BY 1 ORDER BY 1;

-- Detailed bounded triage for source messages after the last feed date.
SELECT m.id,m.occurred_at,m.group_id,m.message_type,left(m.body,240) AS source_excerpt,m.file_name
FROM public.motil_whatsapp_messages m
WHERE m.occurred_at >= '2026-10-28'
 AND m.message_type IN ('textMessage','extendedTextMessage','quotedMessage')
 AND NOT EXISTS (SELECT 1 FROM public.motil_whatsapp_module_updates_v1 f
                 WHERE f.organization_id=m.organization_id AND f.message_id=m.id)
ORDER BY m.occurred_at DESC LIMIT 50;
