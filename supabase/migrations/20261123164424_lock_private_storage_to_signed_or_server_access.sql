-- All MOTIL storage buckets are private. Remove the legacy broad policy that
-- granted every API role access to every object except one server-only bucket.
-- Authenticated uploads/downloads must use application authorization and
-- short-lived signed URLs; backend operations continue through service_role.
DROP POLICY IF EXISTS "maintenance_workbook_manifests_server_only" ON storage.objects;
