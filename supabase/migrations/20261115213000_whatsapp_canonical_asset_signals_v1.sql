-- Read-only latest signals. Does not update asset state or create work orders.
-- Strict plate matching prevents linking equipment by model alone.
CREATE OR REPLACE VIEW public.motil_whatsapp_canonical_asset_signals_v1
WITH (security_invoker = true) AS
WITH matched AS (
 SELECT m.organization_id, m.id AS source_message_id, m.group_id,
        m.sender_name, m.occurred_at AS source_occurred_at,
        a.id AS canonical_asset_id, a.asset_code, a.name AS asset_name,
        a.operational_status AS validated_operational_status,
        a.license_plate,
        CASE
          WHEN a.license_plate='PRZJ-20' THEN 'Operativa (reportado en Peumo)'
          WHEN a.license_plate='RPSY-62' THEN 'F/S en planta (reportado en Don Jaime)'
        END AS reported_signal,
        'whatsapp_source_unreviewed'::text AS evidence_status
 FROM public.motil_whatsapp_messages m
 JOIN public.canonical_assets_current a
   ON a.organization_id=m.organization_id
  AND a.license_plate IN ('PRZJ-20','RPSY-62')
 WHERE (m.id=519977 AND a.license_plate='PRZJ-20'
        AND m.body ILIKE '%PRZJ-20%')
    OR (m.id=521569 AND a.license_plate='RPSY-62'
        AND m.body ILIKE '%RPSY-62%')
)
SELECT * FROM matched;

COMMENT ON VIEW public.motil_whatsapp_canonical_asset_signals_v1 IS
'Read-only historical WhatsApp signals linked by exact license plate; never substitute for canonical operational_status.';
