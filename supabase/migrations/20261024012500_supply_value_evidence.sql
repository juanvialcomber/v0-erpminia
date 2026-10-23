create table if not exists public.procurement_supply_value_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  outcome_id uuid not null references public.procurement_supply_risk_outcomes(id),
  decision_id uuid not null references public.procurement_supply_risk_decisions(id),
  product_id uuid not null,
  impact_type text not null check (
    impact_type in ('time_saved','validated_price_difference','stockout_prevented','risk_reduced','other')
  ),
  observed_value_clp numeric,
  observed_minutes numeric,
  evidence_level text not null default 'E2' check (evidence_level in ('E2','E3')),
  basis_note text not null check (length(trim(basis_note)) >= 10),
  evidence_reference text,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, outcome_id, impact_type)
);

alter table public.procurement_supply_value_evidence
  add constraint procurement_supply_value_amount_check
  check (observed_value_clp is null or observed_value_clp >= 0);

alter table public.procurement_supply_value_evidence
  add constraint procurement_supply_value_minutes_check
  check (observed_minutes is null or observed_minutes >= 0);

create index if not exists idx_supply_value_evidence_org_time
  on public.procurement_supply_value_evidence (organization_id, recorded_at desc);

alter table public.procurement_supply_value_evidence enable row level security;
revoke all on table public.procurement_supply_value_evidence from public,anon,authenticated,service_role;
grant select,insert on table public.procurement_supply_value_evidence to service_role;

comment on table public.procurement_supply_value_evidence is
  'Observed human-entered value evidence linked to closed supply-risk outcomes. Amounts are evidence records, not audited savings or accounting truth.';
