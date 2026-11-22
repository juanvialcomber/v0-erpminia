-- Follow-up to 20261122150000_motil_operational_commitments.
-- Commitments may change state through the audited server route, but cannot
-- be deleted or truncated by the service-role API. Audit events are append-only.
-- No inventory, orders, or source documents are changed.
REVOKE DELETE, TRUNCATE ON public.motil_operational_commitments FROM service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.motil_operational_commitment_events FROM service_role;
