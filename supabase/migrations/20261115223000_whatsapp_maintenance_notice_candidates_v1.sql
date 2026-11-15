-- Proposed maintenance notices, NOT work orders. Planner decision required.
-- Each episode has stable key, source references and a non-automatic action.
-- security_invoker enforces underlying tenant RLS.
CREATE OR REPLACE VIEW public.motil_whatsapp_maintenance_notice_candidates_v1
WITH (security_invoker = true) AS
WITH episodes(episode_key,source_message_id,episode_type,asset_label,reported_event_date,reported_state,proposed_action) AS (
 VALUES
 ('plant-mill-8x48-20261104',307844::bigint,'equipment_stop','Molino 8x48','2026-11-04'::date,'F/S 10:00; E/S 11:30 reportadas','Revisar OT existente y validar intervalo/activo'),
 ('plant-mill-8x48-20261105',322086::bigint,'equipment_stop','Molino 8x48','2026-11-05'::date,'F/S 02:50 reportada; otras F/S 09:30 y E/S 12:00','Determinar episodios y reconciliar con OT'),
 ('plant-power-20261108',408176::bigint,'plant_power_outage',NULL::text,'2026-11-08'::date,'Corte general 18:30-18:40 reportado; origen no confirmado','Validar parte eléctrico y decidir si requiere OT')
)
SELECT m.organization_id,e.episode_key,e.episode_type,e.asset_label,
       e.reported_event_date,e.reported_state,e.proposed_action,
       m.id AS primary_source_message_id,m.group_id,m.sender_name,m.occurred_at AS source_occurred_at,
       'planner_review_required'::text AS review_status,
       false AS authorized_to_create_work_order
FROM episodes e JOIN public.motil_whatsapp_messages m ON m.id=e.source_message_id;
COMMENT ON VIEW public.motil_whatsapp_maintenance_notice_candidates_v1 IS
'Human-review maintenance notices from WhatsApp evidence; no OT creation, no asset-state or KPI mutation.';
