-- Tenant-safe, read-only queue. No automated production/KPI/OT writes.
-- This view exposes recent unprocessed source messages with their group and adjacent
-- conversation context, without treating temporal proximity as evidence of a shared event.
CREATE OR REPLACE VIEW public.motil_whatsapp_unprocessed_context_queue_v1
WITH (security_invoker = true) AS
SELECT m.organization_id, m.id AS source_message_id, m.group_id,
       m.sender_name, m.occurred_at, m.received_at,
       m.message_type, m.body AS source_text, m.file_name,
       m.quoted_message_id,
       CASE
         WHEN m.body ~* '(f/s|fuera de servicio|perdida de aceite|pérdida de aceite|falla|detenci[oó]n)'
           THEN 'equipment_or_stop_review'
         WHEN m.body ~* '(leyes del d[ií]a|muestra|laboratorio|humedad)'
           THEN 'laboratory_document_review'
         WHEN m.body ~* '(despach|camiones|gu[ií]a de despacho)'
           THEN 'dispatch_review'
         WHEN m.body ~* '(tranque|relave|cicl[oó]n|talud)'
           THEN 'tailings_review'
         WHEN m.body ~* '(mina peumo|mina don jaime|san pedro|ra[ií]z del cobre|viajes)'
           THEN 'mine_review'
         ELSE 'conversation_review'
       END AS suggested_review_bucket,
       (SELECT array_agg(n.id ORDER BY n.occurred_at,n.id)
          FROM (SELECT n.id,n.occurred_at
                FROM public.motil_whatsapp_messages n
                WHERE n.organization_id=m.organization_id
                  AND n.group_id=m.group_id
                  AND n.id<>m.id
                  AND n.occurred_at BETWEEN m.occurred_at-interval '30 minutes'
                                        AND m.occurred_at+interval '30 minutes'
                ORDER BY abs(extract(epoch FROM (n.occurred_at-m.occurred_at))),n.id
                LIMIT 12) n) AS nearby_message_ids
FROM public.motil_whatsapp_messages m
WHERE m.occurred_at >= timestamp with time zone '2026-10-28 00:00:00+00'
  AND m.message_type IN ('textMessage','extendedTextMessage','quotedMessage')
  AND NOT EXISTS (
    SELECT 1 FROM public.motil_whatsapp_module_updates_v1 u
    WHERE u.organization_id=m.organization_id AND u.message_id=m.id
  );
COMMENT ON VIEW public.motil_whatsapp_unprocessed_context_queue_v1 IS
'Unprocessed source queue. nearby_message_ids are candidates for human/agent contextual review, not confirmed episode membership.';
