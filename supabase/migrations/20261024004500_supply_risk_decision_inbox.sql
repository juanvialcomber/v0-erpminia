create table if not exists public.procurement_supply_risk_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  product_id uuid not null,
  product_code text not null,
  decision text not null check (decision in ('reviewed','action_required','not_applicable')),
  reason_code text,
  note text,
  risk_score integer not null,
  risk_reasons text[] not null default '{}'::text[],
  evidence_snapshot jsonb not null default '{}'::jsonb,
  decided_by uuid not null,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_supply_risk_decisions_org_product_time
  on public.procurement_supply_risk_decisions (organization_id, product_id, decided_at desc);

create unique index if not exists idx_supply_risk_decisions_current_signature
  on public.procurement_supply_risk_decisions (
    organization_id, product_id, risk_score, decision, decided_at
  );

alter table public.procurement_supply_risk_decisions enable row level security;
revoke all on table public.procurement_supply_risk_decisions from public,anon,authenticated,service_role;
grant select,insert on table public.procurement_supply_risk_decisions to service_role;

comment on table public.procurement_supply_risk_decisions is
  'Human decisions on explainable MOTIL supply-risk signals. Does not create purchase orders, mutate inventory, or write to Laudus.';
