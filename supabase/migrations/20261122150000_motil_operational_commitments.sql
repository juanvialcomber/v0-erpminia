-- Operational commitments are separate from source-derived alerts and work orders.
-- The tasks and customer-specific meeting notes are NOT seeded in the public repository.
CREATE TABLE IF NOT EXISTS public.motil_operational_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  assignee_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 5 AND 160),
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 2000),
  domain text NOT NULL CHECK (domain IN ('warehouse', 'maintenance', 'coordination')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'done')),
  due_date date NULL,
  source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 3 AND 180),
  resolution_note text NULL CHECK (length(resolution_note) <= 2000),
  updated_by_profile_id uuid NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_reference, assignee_profile_id, title)
);
CREATE INDEX IF NOT EXISTS motil_operational_commitments_assignee_idx
  ON public.motil_operational_commitments (organization_id, assignee_profile_id, status, due_date);
ALTER TABLE public.motil_operational_commitments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.motil_operational_commitments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.motil_operational_commitments TO service_role;

CREATE TABLE IF NOT EXISTS public.motil_operational_commitment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commitment_id uuid NOT NULL REFERENCES public.motil_operational_commitments(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  actor_profile_id uuid NULL REFERENCES public.profiles(id),
  previous_status text NULL,
  status text NOT NULL,
  resolution_note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS motil_operational_commitment_events_org_idx
  ON public.motil_operational_commitment_events (organization_id, commitment_id, created_at);
ALTER TABLE public.motil_operational_commitment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.motil_operational_commitment_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.motil_operational_commitment_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.motil_operational_commitment_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.motil_track_operational_commitment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.assignee_profile_id AND p.organization_id = NEW.organization_id AND p.status = 'active')
    OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.created_by_profile_id AND p.organization_id = NEW.organization_id AND p.status = 'active') THEN
    RAISE EXCEPTION 'Commitment actor or assignee does not belong to the same active organization';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = OLD.status AND NEW.resolution_note IS NOT DISTINCT FROM OLD.resolution_note THEN
      RETURN NEW;
    END IF;
  END IF;
  INSERT INTO public.motil_operational_commitment_events
    (commitment_id, organization_id, actor_profile_id, previous_status, status, resolution_note)
  VALUES (
    NEW.id, NEW.organization_id,
    COALESCE(NEW.updated_by_profile_id, NEW.created_by_profile_id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
    NEW.status, NEW.resolution_note
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_motil_operational_commitment_audit ON public.motil_operational_commitments;
CREATE TRIGGER trg_motil_operational_commitment_audit
AFTER INSERT OR UPDATE ON public.motil_operational_commitments
FOR EACH ROW EXECUTE FUNCTION public.motil_track_operational_commitment();
