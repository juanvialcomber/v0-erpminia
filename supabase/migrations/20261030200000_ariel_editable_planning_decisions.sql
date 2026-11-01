-- Ariel's editable decisions are separate from immutable Excel evidence.
-- Only an authorized, explicitly approved decision can create a normal OT.
BEGIN;

CREATE TABLE IF NOT EXISTS public.maintenance_planning_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('official_weekly','preventive_priority')),
  source_id uuid NOT NULL,
  canonical_asset_id uuid REFERENCES canonical.assets(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 240),
  description text,
  work_type text NOT NULL DEFAULT 'preventive'
    CHECK (work_type IN ('preventive','corrective','general')),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','critical')),
  scheduled_date date,
  planned_duration_hours numeric CHECK (planned_duration_hours IS NULL OR
    (planned_duration_hours >= 0 AND planned_duration_hours <= 240)),
  assigned_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  decision_status text NOT NULL DEFAULT 'draft'
    CHECK (decision_status IN ('draft','approved','generated','rejected')),
  review_note text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz,
  linked_work_order_id uuid UNIQUE REFERENCES public.maintenance_work_orders(id) ON DELETE SET NULL,
  last_edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, source_kind, source_id),
  CHECK (decision_status <> 'generated' OR linked_work_order_id IS NOT NULL)
);

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS planning_decision_id uuid
  REFERENCES public.maintenance_planning_decisions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_work_orders_one_per_planning_decision
 ON public.maintenance_work_orders (organization_id, planning_decision_id)
 WHERE planning_decision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_planning_decisions_org_status
 ON public.maintenance_planning_decisions (organization_id,decision_status,updated_at DESC);

ALTER TABLE public.maintenance_planning_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.maintenance_planning_decisions FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.maintenance_planning_decisions TO service_role;

COMMIT;
