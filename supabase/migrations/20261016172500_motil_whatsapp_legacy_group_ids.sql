-- Preserve exact Green API group IDs; legacy groups use digits-digits@g.us.
-- Old database check rejected IDs already accepted by the application.
alter table public.motil_whatsapp_groups
  drop constraint if exists motil_whatsapp_groups_chat_id_check;
alter table public.motil_whatsapp_groups
  add constraint motil_whatsapp_groups_chat_id_check
  check (chat_id ~ '^([0-9]{5,30}|[0-9]{5,20}-[0-9]{1,20})@g[.]us$');
