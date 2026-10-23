create table if not exists public.procurement_supply_risk_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  decision_id uuid not null references public.procurement_supply_risk_decisions(id),
  product_id uuid not null,
  outcome text not null check (outcome in ('resolved','risk_reduced','no_change','false_positive')),
  note text,
  risk_score_before integer not null,
  risk_score_after integer not null,
  evidence_after jsonb not null default '{}'::jsonb,
  time_to_outcome_ms bigint,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, decision_id)
);

alter table public.procurement_supply_risk_outcomes
  add constraint procurement_supply_risk_outcomes_time_check
  check (time_to_outcome_ms is null or time_to_outcome_ms between 0 and 31536000000);

create index if not exists idx_supply_risk_outcomes_org_time
  on public.procurement_supply_risk_outcomes (organization_id, recorded_at desc);

alter table public.procurement_supply_risk_outcomes enable row level security;
revoke all on table public.procurement_supply_risk_outcomes from public,anon,authenticated,service_role;
grant select,insert on table public.procurement_supply_risk_outcomes to service_role;

comment on table public.procurement_supply_risk_outcomes is
  'Terminal human-observed outcomes for MOTIL supply-risk actions. Stores before/after evidence without mutating inventory, purchasing, maintenance or Laudus.';
