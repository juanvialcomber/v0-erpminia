-- Full native workbook evidence is an immutable, compressed private object.
-- Original XLS/XLSX files remain in module-documents. No document is backfilled.
-- This limit matches the server-side compressed artifact bound (3 MiB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'maintenance-workbook-manifests',
  'maintenance-workbook-manifests',
  false,
  3145728,
  ARRAY['application/gzip']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- An existing bucket must already have the intended restrictions. Do not
-- silently change another bucket's visibility, upload types or size limit.
DO $manifest_bucket$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'maintenance-workbook-manifests'
      AND name = 'maintenance-workbook-manifests'
      AND public IS FALSE
      AND file_size_limit = 3145728
      AND allowed_mime_types = ARRAY['application/gzip']::text[]
  ) THEN
    RAISE EXCEPTION 'Workbook manifest bucket configuration does not match';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname = 'objects'
      AND c.relrowsecurity IS TRUE
  ) THEN
    RAISE EXCEPTION 'Storage object row security must remain enabled';
  END IF;
END
$manifest_bucket$;

-- Access is mediated by the existing server client after MOTIL's module,
-- role and organization checks. This policy grants no direct client access
-- and prevents future broad permissive object policies from exposing these
-- artifacts. Other buckets keep their existing policy decisions.
CREATE POLICY maintenance_workbook_manifests_server_only
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO PUBLIC
USING (bucket_id <> 'maintenance-workbook-manifests')
WITH CHECK (bucket_id <> 'maintenance-workbook-manifests');
