-- Human-reviewed proposals for active Laudus cost centers missing from MOTIL canonical hierarchy.
-- Historical discontinued Laudus centers are measured separately and are not proposed as active canonical centers.

create table if not exists public.laudus_cost_center_review_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  laudus_external_id text not null,
  operational_code text,
  decision text not null check (decision in ('approve_proposal','reject_proposal','defer')),
  rationale text,
  reviewer_user_id uuid,
  decided_at timestamptz not null default now(),
  proposal_snapshot jsonb not null default '{}'::jsonb,
  unique (organization_id, laudus_external_id)
);

alter table public.laudus_cost_center_review_decisions enable row level security;
revoke all on table public.laudus_cost_center_review_decisions from public, anon, authenticated;
grant all on table public.laudus_cost_center_review_decisions to service_role;

create index if not exists laudus_cost_center_review_decisions_org_idx
  on public.laudus_cost_center_review_decisions (organization_id, decision, decided_at desc);

create or replace function public.motil_laudus_cost_center_review_queue(
  p_organization_id uuid,
  p_limit integer default 100
)
returns jsonb
language sql
security definer
set search_path = public, integration, canonical, pg_temp
as $$
with pending as (
  select
    l.*,
    parent.operational_code as parent_operational_code
  from integration.laudus_cost_centers l
  left join integration.laudus_cost_centers parent
    on parent.organization_id=l.organization_id
   and parent.external_id=l.parent_external_id
  where l.organization_id=p_organization_id
    and l.canonical_cost_center_id is null
    and l.reconciliation_status='pending'
),
active_pending as (
  select * from pending where not discontinued
),
parent_match as (
  select
    p.*,
    c.id as canonical_parent_id,
    c.cost_center_code as canonical_parent_code,
    c.name as canonical_parent_name,
    c.center_type as canonical_parent_type
  from active_pending p
  left join canonical.cost_centers c
    on c.organization_id=p_organization_id
   and lower(btrim(coalesce(c.cost_center_code,'')))
     = lower(btrim(coalesce(p.parent_operational_code,'')))
),
asset_match as (
  select
    p.external_id,
    a.id as asset_id,
    a.asset_code,
    a.name as asset_name,
    a.license_plate,
    row_number() over (
      partition by p.external_id
      order by a.id
    ) as rn
  from parent_match p
  join canonical.assets a
    on a.organization_id=p_organization_id
   and lower(regexp_replace(coalesce(a.license_plate,''),'[^a-zA-Z0-9]','','g')) <> ''
   and position(
     lower(regexp_replace(coalesce(a.license_plate,''),'[^a-zA-Z0-9]','','g'))
     in lower(regexp_replace(coalesce(p.name,''),'[^a-zA-Z0-9]','','g'))
   ) > 0
),
sibling_type as (
  select
    p.external_id,
    s.center_type,
    count(*) as n,
    row_number() over (
      partition by p.external_id
      order by count(*) desc, s.center_type
    ) as rn
  from parent_match p
  join canonical.cost_centers s
    on s.organization_id=p_organization_id
   and s.parent_code=p.canonical_parent_code
   and s.is_active
   and s.center_type is not null
  group by p.external_id,s.center_type
),
proposals as (
  select
    p.external_id as laudus_external_id,
    p.cost_center_code as laudus_internal_code,
    p.operational_code,
    p.name as laudus_name,
    p.full_path as laudus_full_path,
    p.parent_external_id,
    p.parent_operational_code,
    p.canonical_parent_id,
    p.canonical_parent_code,
    p.canonical_parent_name,
    p.canonical_parent_type,
    s.center_type as suggested_center_type,
    a.asset_id,
    a.asset_code,
    a.asset_name,
    a.license_plate,
    (a.asset_id is not null) as exact_plate_asset_support,
    case
      when p.canonical_parent_id is null then 'missing_parent'
      when a.asset_id is not null then 'strong_asset_backed_proposal'
      when s.center_type is not null then 'hierarchy_backed_proposal'
      else 'review_required'
    end as evidence_level,
    d.decision,
    d.rationale,
    d.reviewer_user_id,
    d.decided_at
  from parent_match p
  left join asset_match a on a.external_id=p.external_id and a.rn=1
  left join sibling_type s on s.external_id=p.external_id and s.rn=1
  left join public.laudus_cost_center_review_decisions d
    on d.organization_id=p_organization_id
   and d.laudus_external_id=p.external_id
),
summary as (
  select jsonb_build_object(
    'laudus_total',(select count(*) from integration.laudus_cost_centers where organization_id=p_organization_id),
    'mapped',(select count(*) from integration.laudus_cost_centers where organization_id=p_organization_id and canonical_cost_center_id is not null),
    'pending_total',(select count(*) from pending),
    'pending_active',(select count(*) from pending where not discontinued),
    'pending_discontinued',(select count(*) from pending where discontinued),
    'active_asset_backed',(select count(*) from proposals where exact_plate_asset_support),
    'active_with_parent',(select count(*) from proposals where canonical_parent_id is not null),
    'reviewed',(select count(*) from proposals where decision is not null),
    'approved',(select count(*) from proposals where decision='approve_proposal'),
    'rejected',(select count(*) from proposals where decision='reject_proposal'),
    'deferred',(select count(*) from proposals where decision='defer')
  ) payload
),
queue as (
  select coalesce(
    jsonb_agg(to_jsonb(p) order by
      case p.evidence_level
        when 'strong_asset_backed_proposal' then 1
        when 'hierarchy_backed_proposal' then 2
        when 'review_required' then 3
        else 4
      end,
      p.operational_code),
    '[]'::jsonb
  ) payload
  from proposals p
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

revoke all on function public.motil_laudus_cost_center_review_queue(uuid,integer) from public,anon,authenticated;
grant execute on function public.motil_laudus_cost_center_review_queue(uuid,integer) to service_role;

comment on function public.motil_laudus_cost_center_review_queue(uuid,integer) is
  'Human-review queue for active Laudus cost centers absent from MOTIL canonical hierarchy. Approval records intent only; it does not create canonical centers.';
