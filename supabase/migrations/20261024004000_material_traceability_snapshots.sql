create table if not exists public.maintenance_material_traceability_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_date date not null,
  modern_work_orders integer not null,
  material_intent_missing integer not null,
  declared_no_materials integer not null,
  declared_uses_materials integer not null,
  with_requirements integer not null,
  with_part_trace integer not null,
  with_issued_materials integer not null,
  with_installed_materials integer not null,
  economic_trace_ready integer not null,
  requirements_with_full_laudus_history integer not null,
  completed_with_trace_gap integer not null,
  overall_traceability_score numeric,
  created_at timestamptz not null default now(),
  unique (organization_id, snapshot_date)
);

alter table public.maintenance_material_traceability_snapshots enable row level security;
revoke all on table public.maintenance_material_traceability_snapshots from public,anon,authenticated;
grant select,insert,update on table public.maintenance_material_traceability_snapshots to service_role;

create index if not exists maintenance_material_traceability_snapshots_org_date_idx
  on public.maintenance_material_traceability_snapshots(organization_id,snapshot_date desc);

create or replace function public.motil_capture_material_traceability_snapshot(
  p_organization_id uuid,
  p_snapshot_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_summary jsonb;
begin
  v_payload := public.motil_material_traceability_readiness(p_organization_id,25);
  v_summary := coalesce(v_payload->'summary','{}'::jsonb);

  insert into public.maintenance_material_traceability_snapshots(
    organization_id,snapshot_date,modern_work_orders,material_intent_missing,
    declared_no_materials,declared_uses_materials,with_requirements,with_part_trace,
    with_issued_materials,with_installed_materials,economic_trace_ready,
    requirements_with_full_laudus_history,completed_with_trace_gap,overall_traceability_score
  ) values (
    p_organization_id,p_snapshot_date,
    coalesce((v_summary->>'modern_work_orders')::int,0),
    coalesce((v_summary->>'material_intent_missing')::int,0),
    coalesce((v_summary->>'declared_no_materials')::int,0),
    coalesce((v_summary->>'declared_uses_materials')::int,0),
    coalesce((v_summary->>'with_requirements')::int,0),
    coalesce((v_summary->>'with_part_trace')::int,0),
    coalesce((v_summary->>'with_issued_materials')::int,0),
    coalesce((v_summary->>'with_installed_materials')::int,0),
    coalesce((v_summary->>'economic_trace_ready')::int,0),
    coalesce((v_summary->>'requirements_with_full_laudus_history')::int,0),
    coalesce((v_summary->>'completed_with_trace_gap')::int,0),
    nullif(v_summary->>'overall_traceability_score','')::numeric
  )
  on conflict (organization_id,snapshot_date) do update set
    modern_work_orders=excluded.modern_work_orders,
    material_intent_missing=excluded.material_intent_missing,
    declared_no_materials=excluded.declared_no_materials,
    declared_uses_materials=excluded.declared_uses_materials,
    with_requirements=excluded.with_requirements,
    with_part_trace=excluded.with_part_trace,
    with_issued_materials=excluded.with_issued_materials,
    with_installed_materials=excluded.with_installed_materials,
    economic_trace_ready=excluded.economic_trace_ready,
    requirements_with_full_laudus_history=excluded.requirements_with_full_laudus_history,
    completed_with_trace_gap=excluded.completed_with_trace_gap,
    overall_traceability_score=excluded.overall_traceability_score,
    created_at=now();

  return jsonb_build_object('snapshotDate',p_snapshot_date,'summary',v_summary);
end;
$$;

create or replace function public.motil_material_traceability_history(
  p_organization_id uuid,
  p_days integer default 30
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
with rows as (
  select snapshot_date,modern_work_orders,material_intent_missing,declared_no_materials,
         declared_uses_materials,with_requirements,with_part_trace,with_issued_materials,
         with_installed_materials,economic_trace_ready,requirements_with_full_laudus_history,
         completed_with_trace_gap,overall_traceability_score
  from public.maintenance_material_traceability_snapshots
  where organization_id=p_organization_id
    and snapshot_date >= current_date-greatest(1,least(coalesce(p_days,30),365))
  order by snapshot_date
),
bounds as (
  select
    (select to_jsonb(r) from rows r order by snapshot_date asc limit 1) first_snapshot,
    (select to_jsonb(r) from rows r order by snapshot_date desc limit 1) latest_snapshot,
    (select count(*)::int from rows) snapshot_count
)
select jsonb_build_object(
  'snapshots',coalesce((select jsonb_agg(to_jsonb(rows)) from rows),'[]'::jsonb),
  'first',first_snapshot,
  'latest',latest_snapshot,
  'snapshotCount',snapshot_count,
  'semantics','Tendencia de cobertura observada; no equivale a ahorro ni calidad de mantenimiento.'
)
from bounds;
$$;

revoke execute on function public.motil_capture_material_traceability_snapshot(uuid,date) from public,anon,authenticated;
revoke execute on function public.motil_material_traceability_history(uuid,integer) from public,anon,authenticated;
grant execute on function public.motil_capture_material_traceability_snapshot(uuid,date) to service_role;
grant execute on function public.motil_material_traceability_history(uuid,integer) to service_role;
