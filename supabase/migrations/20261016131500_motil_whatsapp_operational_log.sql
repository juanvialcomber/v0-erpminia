-- Source-backed plant/dispatch operational log. NEVER a machinery-maintenance OT
-- and NEVER automatically a certified production metric, HSE event or work closure.
create table if not exists public.motil_whatsapp_operational_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_id uuid not null references public.motil_whatsapp_daily_reports(id) on delete restrict,
  report_date date not null,
  finding_index integer not null check (finding_index between 0 and 49),
  scope text not null check (scope in ('plant','dispatch','general')),
  category text not null check (category in (
    'plant_intervention','cleaning','process_adjustment','process_reading',
    'pending_task','dispatch_coordination','other'
  )),
  reported_state text not null check (reported_state in
    ('reported_done','pending','planned','unclear')),
  summary text not null check (length(btrim(summary)) between 1 and 450),
  source_message_ids bigint[] not null check (cardinality(source_message_ids) between 1 and 20),
  source_group_ids uuid[] not null check (cardinality(source_group_ids) between 1 and 20),
  reported_domain text,
  review_note text not null,
  evidence_reviewed_by uuid not null,
  evidence_reviewed_at timestamptz not null,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  -- Site, operator and shift intentionally remain unassigned until canonical
  -- identity is established from trusted operational records.
  unique(organization_id, report_id, finding_index)
);
create index if not exists motil_whatsapp_operational_log_org_date_idx
  on public.motil_whatsapp_operational_log(organization_id, report_date desc, recorded_at desc);

alter table public.motil_whatsapp_operational_log enable row level security;
revoke all on public.motil_whatsapp_operational_log from public, anon, authenticated;
grant all on public.motil_whatsapp_operational_log to service_role;

comment on table public.motil_whatsapp_operational_log is
  'Human-routed WhatsApp plant/dispatch observations. Source claims only, not certified plant output or machinery work orders.';

-- Exact source IDs, tenant boundary and reviewed finding are verified together
-- with the insert, so a retry cannot create duplicate activity entries.
create or replace function public.motil_whatsapp_record_operational_finding(
  p_organization_id uuid,
  p_report_date date,
  p_finding_index integer,
  p_scope text,
  p_category text,
  p_reported_state text,
  p_actor_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  report_row public.motil_whatsapp_daily_reports%rowtype;
  finding jsonb;
  ids bigint[];
  groups uuid[];
  actual_count integer;
  log_id uuid;
  existing_row public.motil_whatsapp_operational_log%rowtype;
  source_note text;
begin
  if p_organization_id is null or p_report_date is null or p_actor_id is null
     or p_finding_index is null or p_finding_index < 0 or p_finding_index > 49
  then raise exception 'invalid_operational_request'; end if;
  if p_scope not in ('plant','dispatch','general') or
     p_category not in ('plant_intervention','cleaning','process_adjustment',
       'process_reading','pending_task','dispatch_coordination','other') or
     p_reported_state not in ('reported_done','pending','planned','unclear')
  then raise exception 'invalid_operational_classification'; end if;
  if (p_category = 'dispatch_coordination' and p_scope <> 'dispatch')
     or (p_scope = 'dispatch' and p_category not in ('dispatch_coordination','other'))
  then raise exception 'invalid_operational_classification'; end if;

  select * into report_row from public.motil_whatsapp_daily_reports
  where organization_id = p_organization_id and report_date = p_report_date for update;
  if not found then raise exception 'report_not_found'; end if;
  if report_row.status <> 'ready' or
     jsonb_typeof(report_row.findings) <> 'array' or
     p_finding_index >= jsonb_array_length(report_row.findings)
  then raise exception 'report_not_ready'; end if;

  -- Match the UI's conservative source-revocation policy inside the database
  -- transaction. Otherwise a direct RPC call could reuse an already-confirmed
  -- finding after its report had become stale.
  if exists (
    select 1 from public.motil_whatsapp_groups g
    where g.organization_id=p_organization_id
      and not g.enabled
      and (report_row.generated_at is null or g.updated_at is null
           or g.updated_at > report_row.generated_at)
  ) then raise exception 'source_scope_stale'; end if;

  if exists (
    select 1 from public.motil_whatsapp_groups g
    where g.organization_id=p_organization_id and g.enabled
      and g.chat_id = '120363427917216825@g.us'
  ) then raise exception 'excluded_source_enabled'; end if;

  finding := report_row.findings -> p_finding_index;
  if finding ->> 'review_status' <> 'confirmed'
     or length(btrim(coalesce(finding ->> 'detail',''))) < 1
     or length(btrim(coalesce(finding ->> 'detail',''))) > 450
     or coalesce(finding ->> 'review_note','') = ''
     or coalesce(finding ->> 'reviewed_by','') = ''
     or coalesce(finding ->> 'reviewed_at','') = ''
  then raise exception 'human_review_required'; end if;

  if jsonb_typeof(finding -> 'source_ids') <> 'array'
     or jsonb_array_length(finding -> 'source_ids') < 1
     or jsonb_array_length(finding -> 'source_ids') > 20
  then raise exception 'source_evidence_invalid'; end if;
  if exists(
    select 1 from jsonb_array_elements_text(finding -> 'source_ids') as src(value)
    where src.value !~ '^[1-9][0-9]{0,17}$'
  ) then raise exception 'source_evidence_invalid'; end if;

  select array_agg(distinct src.value::bigint) into ids
  from jsonb_array_elements_text(finding -> 'source_ids') as src(value);
  if cardinality(ids) <> jsonb_array_length(finding -> 'source_ids')
  then raise exception 'source_evidence_invalid'; end if;

  -- Review validity is conditional on *current* source authorization:
  -- disabled or excluded WhatsApp groups must not be reintroduced by a cached
  -- report, even when their historical message IDs are known.
  select count(*), array_agg(distinct m.group_id) into actual_count,groups
  from public.motil_whatsapp_messages m
  join public.motil_whatsapp_groups g on g.id=m.group_id
    and g.organization_id=p_organization_id and g.enabled=true
    and g.chat_id <> '120363427917216825@g.us'
  where m.organization_id = p_organization_id and m.id=any(ids);
  if actual_count <> cardinality(ids) or cardinality(groups) < 1
  then raise exception 'source_messages_missing_or_disabled'; end if;

  -- A confirmed conversation is an observed *claim*; it is not a certified
  -- completion, nor a measured tonnage, grade, recovery or maintenance OT.
  select * into existing_row from public.motil_whatsapp_operational_log
  where organization_id=p_organization_id and report_id=report_row.id
    and finding_index=p_finding_index limit 1;
  if found then
    if existing_row.scope <> p_scope or existing_row.category <> p_category
       or existing_row.reported_state <> p_reported_state
    then raise exception 'finding_already_recorded_differently'; end if;
    return jsonb_build_object('ok',true,'status','already_recorded','id',existing_row.id);
  end if;

  source_note := left(coalesce(finding ->> 'review_note',''),500);
  insert into public.motil_whatsapp_operational_log (
    organization_id,report_id,report_date,finding_index,
    scope,category,reported_state,summary,source_message_ids,
    source_group_ids,reported_domain,review_note,
    evidence_reviewed_by,evidence_reviewed_at,recorded_by
  ) values (
    p_organization_id,report_row.id,p_report_date,p_finding_index,
    p_scope,p_category,p_reported_state,finding ->> 'detail',
    ids,groups,left(coalesce(finding ->> 'domain',''),60),
    source_note,(finding ->> 'reviewed_by')::uuid,
    (finding ->> 'reviewed_at')::timestamptz,p_actor_id
  )
  returning id into log_id;

  finding := finding || jsonb_build_object(
    'operational_log_id',log_id,'operational_scope',p_scope,
    'operational_category',p_category,
    'operational_reported_state',p_reported_state
  );
  update public.motil_whatsapp_daily_reports
  set findings=jsonb_set(findings,array[p_finding_index::text],finding,false),
      updated_at=now()
  where id=report_row.id and organization_id=p_organization_id;

  return jsonb_build_object('ok',true,'status','recorded','id',log_id);
end;
$function$;

revoke all on function public.motil_whatsapp_record_operational_finding(
  uuid,date,integer,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.motil_whatsapp_record_operational_finding(
  uuid,date,integer,text,text,text,uuid) to service_role;

comment on function public.motil_whatsapp_record_operational_finding(
  uuid,date,integer,text,text,text,uuid) is
  'Authenticated API only: records a human-reviewed WhatsApp observation to independent operational log; does not mutate production KPI or maintenance OT.';
