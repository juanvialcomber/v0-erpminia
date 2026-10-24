-- Additive repair for already migrated databases.
-- Historical CREATE migrations carry the same grants for fresh resets.
-- No policy, default ACL, anonymous/authenticated grant, or data change.
BEGIN;
grant select, insert, update on table public.geology_ai_conversations to service_role;
grant select, insert on table public.geology_ai_messages to service_role;
grant select, insert, update on table public.geology_ai_user_memory to service_role;
grant select, insert, update on table public.motil_ai_conversations to service_role;
grant select, insert on table public.motil_ai_messages to service_role;
grant select, insert, update on table public.motil_ai_user_memory to service_role;
grant select, insert, update on table public.motil_ai_decision_cases to service_role;
grant select, insert, update, delete on table public.user_push_subscriptions to service_role;
grant select, insert, update on table public.eecc_document_applicability to service_role;
grant select on table public.carpeta_documento_versiones to service_role;
grant select, insert, update on table public.legal_ai_document_reviews to service_role;
grant select, insert on table public.motil_whatsapp_review_decisions to service_role;
COMMIT;
