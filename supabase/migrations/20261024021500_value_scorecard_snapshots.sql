create table if not exists public.motil_value_scorecard_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  snapshot_date date not null,
  time_zone text not null default 'America/Santiago',
  evidence_level text not null,
  workflow_level integer not null,
  scale_gate text not null,
  connected_data jsonb not null default '{}'::jsonb,
  assisted_decision jsonb not null default '{}'::jsonb,
  outcomes jsonb not null default '{}'::jsonb,
  observed_impact jsonb not null default '{}'::jsonb,
  adoption_gate jsonb not null default '{}'::jsonb,
  scorecard_payload jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  unique (organization_id, snapshot_date)
);

create index if not exists idx_motil_value_scorecard_snapshots_org_date
  on public.motil_value_scorecard_snapshots (organization_id, snapshot_date desc);

alter table public.motil_value_scorecard_snapshots enable row level security;
revoke all on table public.motil_value_scorecard_snapshots from public,anon,authenticated,service_role;
grant select on table public.motil_value_scorecard_snapshots to service_role;

create or replace function public.motil_capture_value_scorecard_snapshot(
  p_organization_id uuid,
  p_snapshot_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload jsonb;
begin
  v_payload := public.motil_value_scorecard_preview(p_organization_id);

  insert into public.motil_value_scorecard_snapshots (
    organization_id,
    snapshot_date,
    evidence_level,
    workflow_level,
    scale_gate,
    connected_data,
    assisted_decision,
    outcomes,
    observed_impact,
    adoption_gate,
    scorecard_payload,
    captured_at
  )
  values (
    p_organization_id,
    p_snapshot_date,
    coalesce(v_payload->>'evidenceLevel','E1'),
    coalesce((v_payload->>'workflowLevel')::integer,0),
    coalesce(v_payload->>'scaleGate','CONDITIONAL'),
    coalesce(v_payload->'connectedData','{}'::jsonb),
    coalesce(v_payload->'assistedDecision','{}'::jsonb),
    coalesce(v_payload->'outcomes','{}'::jsonb),
    coalesce(v_payload->'observedImpact','{}'::jsonb),
    coalesce(v_payload->'adoptionGate','{}'::jsonb),
    v_payload,
    now()
  )
  on conflict (organization_id,snapshot_date)
  do update set
    evidence_level=excluded.evidence_level,
    workflow_level=excluded.workflow_level,
    scale_gate=excluded.scale_gate,
    connected_data=excluded.connected_data,
    assisted_decision=excluded.assisted_decision,
    outcomes=excluded.outcomes,
    observed_impact=excluded.observed_impact,
    adoption_gate=excluded.adoption_gate,
    scorecard_payload=excluded.scorecard_payload,
    captured_at=now();

  return v_payload;
end;
$function$;

create or replace function public.motil_value_scorecard_history_preview(
  p_organization_id uuid,
  p_limit integer default 90
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $function$
with rows as (
  select snapshot_date,evidence_level,workflow_level,scale_gate,
         connected_data,assisted_decision,outcomes,observed_impact,adoption_gate,captured_at
  from public.motil_value_scorecard_snapshots
  where organization_id=p_organization_id
  order by snapshot_date desc
  limit greatest(1,least(coalesce(p_limit,90),365))
),
ordered as (
  select * from rows order by snapshot_date asc
)
select jsonb_build_object(
  'count',(select count(*) from rows),
  'first',coalesce((select to_jsonb(x) from ordered x order by snapshot_date asc limit 1),'null'::jsonb),
  'latest',coalesce((select to_jsonb(x) from ordered x order by snapshot_date desc limit 1),'null'::jsonb),
  'series',coalesce((select jsonb_agg(to_jsonb(x) order by snapshot_date) from ordered x),'[]'::jsonb)
);
$function$;

revoke all on function public.motil_capture_value_scorecard_snapshot(uuid,date) from public,anon,authenticated;
grant execute on function public.motil_capture_value_scorecard_snapshot(uuid,date) to service_role;

revoke all on function public.motil_value_scorecard_history_preview(uuid,integer) from public,anon,authenticated;
grant execute on function public.motil_value_scorecard_history_preview(uuid,integer) to service_role;

comment on table public.motil_value_scorecard_snapshots is
  'Daily historical evidence for MOTIL value realization. Snapshots preserve what was known on each business date and do not backfill hypothetical ROI.';

comment on function public.motil_capture_value_scorecard_snapshot(uuid,date) is
  'Backend-only idempotent daily capture of the MOTIL value scorecard for a Chile business date.';
