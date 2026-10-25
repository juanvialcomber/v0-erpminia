-- Server-only read facade for the finance ledger views.
-- The API must enforce fin_finanzas before calling these functions.
BEGIN;

CREATE OR REPLACE FUNCTION public.motil_finance_event_ledger_events_v1(
  p_organization_id uuid,
  p_status text DEFAULT NULL,
  p_q text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE(
    jsonb_agg(to_jsonb(ledger_row) ORDER BY ledger_row.event_at DESC NULLS LAST),
    '[]'::jsonb
  )
  FROM (
    SELECT ledger.*
    FROM intelligence.canonical_clp_cost_ledger AS ledger
    WHERE ledger.organization_id = p_organization_id
      AND EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.id = public.current_application_user_id()
          AND profile.organization_id = p_organization_id
          AND profile.status = 'active'
      )
      AND (
        NULLIF(BTRIM(p_status), '') IS NULL
        OR BTRIM(p_status) = 'all'
        OR ledger.recognition_status = BTRIM(p_status)
      )
      AND (
        NULLIF(BTRIM(p_q), '') IS NULL
        OR COALESCE(ledger.description, '') ILIKE '%' || BTRIM(p_q) || '%'
        OR COALESCE(ledger.source_record_id, '') ILIKE '%' || BTRIM(p_q) || '%'
        OR COALESCE(ledger.cost_center_code, '') ILIKE '%' || BTRIM(p_q) || '%'
      )
    ORDER BY ledger.event_at DESC NULLS LAST
    LIMIT 250
  ) AS ledger_row;
$function$;

CREATE OR REPLACE FUNCTION public.motil_finance_event_ledger_overview_v1(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT to_jsonb(overview_row)
  FROM intelligence.canonical_finance_overview AS overview_row
  WHERE overview_row.organization_id = p_organization_id
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = public.current_application_user_id()
        AND profile.organization_id = p_organization_id
        AND profile.status = 'active'
    )
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.motil_finance_event_ledger_events_v1(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.motil_finance_event_ledger_overview_v1(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.motil_finance_event_ledger_events_v1(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.motil_finance_event_ledger_overview_v1(uuid)
  TO service_role;

COMMENT ON FUNCTION public.motil_finance_event_ledger_events_v1(uuid, text, text)
  IS 'Service-role-only read facade for the finance ledger. The API must enforce fin_finanzas.';
COMMENT ON FUNCTION public.motil_finance_event_ledger_overview_v1(uuid)
  IS 'Service-role-only read facade for the finance overview. The API must enforce fin_finanzas.';

COMMIT;
