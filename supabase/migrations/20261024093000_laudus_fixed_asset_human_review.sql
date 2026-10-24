-- Human-reviewed Laudus fixed-asset identity decisions.
-- Decisions are evidence only and never mutate canonical.assets or Laudus.

create table if not exists public.laudus_fixed_asset_review_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  laudus_external_id text not null,
  candidate_asset_id uuid,
  decision text not null check (decision in ('confirm_candidate','reject_candidate','defer')),
  evidence_level text,
  name_similarity numeric,
  score_gap numeric,
  rationale text,
  reviewer_user_id uuid,
  decided_at timestamptz not null default now(),
  candidate_snapshot jsonb not null default '{}'::jsonb,
  unique (organization_id, laudus_external_id)
);

alter table public.laudus_fixed_asset_review_decisions enable row level security;

revoke all on table public.laudus_fixed_asset_review_decisions from public, anon, authenticated;
grant all on table public.laudus_fixed_asset_review_decisions to service_role;

create index if not exists laudus_fixed_asset_review_decisions_org_idx
  on public.laudus_fixed_asset_review_decisions (organization_id, decision, decided_at desc);

create or replace function public.motil_laudus_fixed_asset_review_queue(
  p_organization_id uuid,
  p_limit integer default 100
)
returns jsonb
language sql
security definer
set search_path = public, integration, canonical, pg_temp
as $$
with candidates as (
  select *
  from public.motil_get_laudus_fixed_asset_candidates(
    p_organization_id,
    least(greatest(coalesce(p_limit,100),1),500)
  )
),
enriched as (
  select
    c.*,
    l.acquisition_date,
    l.acquisition_cost,
    l.useful_life,
    l.realizable_value,
    l.depreciation_type,
    l.supplier_name,
    l.invoice_number,
    l.location as laudus_location,
    a.manufacturer as canonical_manufacturer,
    a.model as canonical_model,
    a.serial_number as canonical_serial_number,
    a.location as canonical_location,
    a.acquisition_date as canonical_acquisition_date,
    a.acquisition_cost as canonical_acquisition_cost,
    d.decision,
    d.rationale,
    d.reviewer_user_id,
    d.decided_at
  from candidates c
  join integration.laudus_fixed_assets l
    on l.organization_id=p_organization_id
   and l.external_id=c.laudus_external_id
  left join canonical.assets a
    on a.organization_id=p_organization_id
   and a.id=c.canonical_asset_id
  left join public.laudus_fixed_asset_review_decisions d
    on d.organization_id=p_organization_id
   and d.laudus_external_id=c.laudus_external_id
),
summary as (
  select jsonb_build_object(
    'laudus_assets',(select count(*) from integration.laudus_fixed_assets where organization_id=p_organization_id),
    'canonical_assets',(select count(*) from canonical.assets where organization_id=p_organization_id),
    'candidate_rows',(select count(*) from enriched),
    'strong_candidates',(select count(*) from enriched where evidence_level='strong_candidate'),
    'candidates',(select count(*) from enriched where evidence_level='candidate'),
    'many_to_one',(select count(*) from enriched where evidence_level='many_to_one_review'),
    'ambiguous',(select count(*) from enriched where evidence_level='ambiguous'),
    'reviewed',(select count(*) from enriched where decision is not null),
    'confirmed',(select count(*) from enriched where decision='confirm_candidate'),
    'rejected',(select count(*) from enriched where decision='reject_candidate'),
    'deferred',(select count(*) from enriched where decision='defer')
  ) payload
),
queue as (
  select coalesce(jsonb_agg(to_jsonb(q) order by q.priority_rank,q.best_name_similarity desc,q.laudus_external_id),'[]'::jsonb) payload
  from (
    select e.*,
      case
        when decision is not null then 9
        when evidence_level='strong_candidate' then 1
        when evidence_level='candidate' then 2
        when evidence_level='many_to_one_review' then 3
        when evidence_level='ambiguous' then 4
        else 5
      end as priority_rank
    from enriched e
  ) q
)
select jsonb_build_object(
  'source','Laudus + MOTIL',
  'read_only_source',true,
  'summary',(select payload from summary),
  'queue',(select payload from queue),
  'canonical_mutated',false,
  'laudus_mutated',false
);
$$;

revoke all on function public.motil_laudus_fixed_asset_review_queue(uuid,integer) from public, anon, authenticated;
grant execute on function public.motil_laudus_fixed_asset_review_queue(uuid,integer) to service_role;

comment on table public.laudus_fixed_asset_review_decisions is
  'Human identity-review decisions for Laudus fixed assets. Never auto-promotes identity into canonical assets.';
