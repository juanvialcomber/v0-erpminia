-- Safety correction: motil_whatsapp_module_updates_v1 is a NON-UPDATABLE VIEW.
-- The original migration attempted UPDATE against it and would fail deployment.
-- Routing changes require the underlying canonical source table and authorization.
-- Keep this migration intentionally read-only; do not mutate production data.
DO $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM information_schema.views
   WHERE table_schema='public' AND table_name='motil_whatsapp_module_updates_v1'
 ) THEN
   RAISE EXCEPTION 'Expected source view motil_whatsapp_module_updates_v1 missing';
 END IF;
END $$;
