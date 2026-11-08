-- Classify future Laudus cost centers with zero operational/financial activity as dormant.
-- They remain in source evidence but do not create human work until activity appears.
-- Any later activity reactivates the source row and reconciliation review automatically.

create or replace function public.motil_classify_dormant_laudus_cost_centers(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, integration, canonical, pg_temp
as $$
declare
  v_dormant integer := 0;
  v_reactivated integer := 0;
begin
  with candidates as (
    select l.id,l.external_id,l.operational_code,l.name
    from integration.laudus_cost_centers l
    where l.organization_id=p_organization_id
      and l.reconciliation_status='pending'
      and not l.discontinued
      and substring(coalesce(l.name,'') from '(20[0-9]{2})') is not null
      and substring(coalesce(l.name,'') from '(20[0-9]{2})')::integer > extract(year from current_date)::integer
      and not exists (
        select 1 from integration.laudus_accounting_entries a
        where a.organization_id=p_organization_id
          and a.cost_center_external_id=l.external_id
      )
      and not exists (
        select 1 from integration.laudus_purchase_payment_allocations p
        where p.organization_id=p_organization_id
          and p.cost_center_external_id=l.external_id
      )
      and not exists (
        select 1 from canonical.assets a
        where a.organization_id=p_organization_id
          and a.cost_center_code=l.operational_code
      )
      and not exists (
        select 1 from canonical.asset_costs a
        where a.organization_id=p_organization_id
          and a.cost_center_code=l.operational_code
      )
      and not exists (
        select 1 from canonical.purchase_orders po
        where po.organization_id=p_organization_id
          and po.cost_center_code=l.operational_code
      )
      and not exists (
        select 1 from canonical.purchase_order_lines pol
        where pol.organization_id=p_organization_id
          and pol.cost_center_code=l.operational_code
      )
      and not exists (
        select 1 from canonical.procurement_requests pr
        where pr.organization_id=p_organization_id
          and pr.cost_center_code=l.operational_code
      )
  ),
  upd as (
    update integration.laudus_cost_centers l
    set reconciliation_status='ignored',
        canonical_cost_center_id=null
    from candidates c
    where l.id=c.id
    returning l.external_id,l.operational_code,l.name
  ),
  ri as (
    update integration.reconciliation_items r
    set resolution_status='ignored',
        resolution_method='future_master_without_activity',
        confidence=1,
        conflict_reasons='{}'::text[]
    from upd u
    where r.organization_id=p_organization_id
      and r.entity_type='cost_center'
      and r.external_id=u.external_id
    returning r.external_id
  ),
  review as (
    update public.data_reconciliation_reviews d
    set status='ignored',
        resolution_note='Centro Laudus futuro sin actividad financiera ni operacional. Se conserva como evidencia y se reactivará automáticamente al primer uso.',
        reviewed_at=now(),
        updated_at=now()
    from upd u
    where d.organization_id=p_organization_id
      and d.issue_key='laudus:cost_center_pending:'||u.external_id
      and d.status='open'
    returning d.issue_key
  )
  select count(*) into v_dormant from upd;

  with active_future as (
    select l.external_id,l.operational_code,l.name
    from integration.laudus_cost_centers l
    where l.organization_id=p_organization_id
      and l.reconciliation_status='ignored'
      and not l.discontinued
      and substring(coalesce(l.name,'') from '(20[0-9]{2})') is not null
      and substring(coalesce(l.name,'') from '(20[0-9]{2})')::integer > extract(year from current_date)::integer
      and (
        exists (
          select 1 from integration.laudus_accounting_entries a
          where a.organization_id=p_organization_id
            and a.cost_center_external_id=l.external_id
        )
        or exists (
          select 1 from integration.laudus_purchase_payment_allocations p
          where p.organization_id=p_organization_id
            and p.cost_center_external_id=l.external_id
        )
        or exists (
          select 1 from canonical.assets a
          where a.organization_id=p_organization_id
            and a.cost_center_code=l.operational_code
        )
        or exists (
          select 1 from canonical.asset_costs a
          where a.organization_id=p_organization_id
            and a.cost_center_code=l.operational_code
        )
        or exists (
          select 1 from canonical.purchase_orders po
          where po.organization_id=p_organization_id
            and po.cost_center_code=l.operational_code
        )
        or exists (
          select 1 from canonical.purchase_order_lines pol
          where pol.organization_id=p_organization_id
            and pol.cost_center_code=l.operational_code
        )
        or exists (
          select 1 from canonical.procurement_requests pr
          where pr.organization_id=p_organization_id
            and pr.cost_center_code=l.operational_code
        )
      )
  ),
  upd as (
    update integration.laudus_cost_centers l
    set reconciliation_status='pending'
    from active_future a
    where l.organization_id=p_organization_id
      and l.external_id=a.external_id
    returning l.external_id,l.operational_code,l.name
  ),
  ri as (
    update integration.reconciliation_items r
    set resolution_status='pending',
        resolution_method=null,
        confidence=null
    from upd u
    where r.organization_id=p_organization_id
      and r.entity_type='cost_center'
      and r.external_id=u.external_id
    returning r.external_id
  ),
  review as (
    insert into public.data_reconciliation_reviews(
      organization_id,entity_type,entity_id,issue_key,status,evidence_reference,created_at,updated_at
    )
    select
      p_organization_id,
      'cost_center',
      null,
      'laudus:cost_center_pending:'||u.external_id,
      'open',
      'Centro Laudus futuro reactivado por primera actividad real. code='||coalesce(u.operational_code,'')||' | name='||coalesce(u.name,''),
      now(),
      now()
    from upd u
    on conflict (organization_id,issue_key)
    do update set
      status='open',
      resolution_note=null,
      reviewed_at=null,
      evidence_reference=excluded.evidence_reference,
      updated_at=now()
    returning issue_key
  )
  select count(*) into v_reactivated from upd;

  return jsonb_build_object(
    'dormant',v_dormant,
    'reactivated',v_reactivated,
    'canonical_mutated',false,
    'laudus_mutated',false
  );
end;
$$;

revoke all on function public.motil_classify_dormant_laudus_cost_centers(uuid)
  from public,anon,authenticated;
grant execute on function public.motil_classify_dormant_laudus_cost_centers(uuid)
  to service_role;

comment on function public.motil_classify_dormant_laudus_cost_centers(uuid)
is 'Keeps future Laudus cost centers with zero evidence out of human queues and reactivates them automatically when real activity appears.';
