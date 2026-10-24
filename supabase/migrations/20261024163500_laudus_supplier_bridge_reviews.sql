-- Human review labels for the Laudus historical supplier bridge.
-- Review-only: never mutates canonical suppliers or purchase orders.

create table if not exists integration.laudus_supplier_bridge_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  supplier_name_key text not null,
  proposed_canonical_supplier_id uuid,
  decision text not null check (decision in ('accepted','rejected','deferred')),
  reason text,
  actor_user_id uuid not null,
  actor_name text,
  created_at timestamptz not null default now()
);

alter table integration.laudus_supplier_bridge_reviews enable row level security;

create index if not exists laudus_supplier_bridge_reviews_org_name_idx
  on integration.laudus_supplier_bridge_reviews(
    organization_id,
    supplier_name_key,
    created_at desc
  );

revoke all on integration.laudus_supplier_bridge_reviews from public,anon,authenticated;
grant select,insert on integration.laudus_supplier_bridge_reviews to service_role;

create or replace view public.laudus_supplier_bridge_reviews_service_v1
with (security_invoker = true)
as
select
  id,
  organization_id,
  supplier_name_key,
  proposed_canonical_supplier_id,
  decision,
  reason,
  actor_user_id,
  actor_name,
  created_at
from integration.laudus_supplier_bridge_reviews;

revoke all on public.laudus_supplier_bridge_reviews_service_v1 from public,anon,authenticated;
grant select on public.laudus_supplier_bridge_reviews_service_v1 to service_role;

create or replace function public.motil_record_laudus_supplier_bridge_review(
  p_organization_id uuid,
  p_supplier_name_key text,
  p_proposed_canonical_supplier_id uuid,
  p_decision text,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security invoker
set search_path = public,integration,pg_temp
as $function$
declare
  v_id uuid;
  v_candidate integration.laudus_supplier_bridge_candidates_v1%rowtype;
begin
  if p_decision not in ('accepted','rejected','deferred') then
    raise exception 'Invalid supplier bridge review decision';
  end if;

  if p_decision = 'rejected' and nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'Reason required for rejected supplier bridge review';
  end if;

  select *
  into v_candidate
  from integration.laudus_supplier_bridge_candidates_v1 c
  where c.organization_id = p_organization_id
    and c.supplier_name_key = p_supplier_name_key;

  if not found then
    raise exception 'Supplier bridge candidate outside organization scope';
  end if;

  if v_candidate.resolution_status <> 'tax_verified_exact' then
    raise exception 'Supplier bridge candidate is not tax verified';
  end if;

  if v_candidate.proposed_canonical_supplier_id is distinct from p_proposed_canonical_supplier_id then
    raise exception 'Supplier bridge candidate changed';
  end if;

  insert into integration.laudus_supplier_bridge_reviews(
    organization_id,
    supplier_name_key,
    proposed_canonical_supplier_id,
    decision,
    reason,
    actor_user_id,
    actor_name
  )
  values(
    p_organization_id,
    p_supplier_name_key,
    p_proposed_canonical_supplier_id,
    p_decision,
    nullif(trim(coalesce(p_reason,'')),''),
    p_actor_user_id,
    nullif(trim(coalesce(p_actor_name,'')),'')
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.motil_record_laudus_supplier_bridge_review(
  uuid,text,uuid,text,text,uuid,text
) from public,anon,authenticated;

grant execute on function public.motil_record_laudus_supplier_bridge_review(
  uuid,text,uuid,text,text,uuid,text
) to service_role;

comment on table integration.laudus_supplier_bridge_reviews is
  'Human review labels for tax-verified historical supplier bridge candidates. Does not mutate canonical purchase orders or suppliers.';
