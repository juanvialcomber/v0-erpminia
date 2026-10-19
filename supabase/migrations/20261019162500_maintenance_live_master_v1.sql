begin;

create or replace view public.motil_maintenance_live_master_v1
with (security_invoker=true) as
with latest_planning as (
  select distinct on (p.organization_id,p.canonical_asset_id)
    p.organization_id,
    p.canonical_asset_id,
    p.asset_code as planning_asset_code,
    p.asset_name as planning_asset_name,
    p.mine_raw,
    p.meter_unit,
    p.current_reading,
    p.next_due_meter,
    p.remaining_meter,
    p.priority as planning_priority,
    p.recommended_action,
    p.scheduled_date,
    p.programming_status_raw,
    p.responsible_raw,
    p.parts_status_raw,
    p.observations as planning_observations,
    p.source_file as planning_source_file,
    p.imported_at as planning_imported_at
  from public.planning_maintenance_priority_v1 p
  where p.canonical_asset_id is not null
  order by p.organization_id,p.canonical_asset_id,p.imported_at desc,p.source_row desc
),
latest_email as (
  select distinct on (e.organization_id,e.candidate_asset_id)
    e.organization_id,
    e.candidate_asset_id as canonical_asset_id,
    e.report_date,
    e.meter_unit as email_meter_unit,
    e.meter_value as email_meter_value,
    e.reported_mp_status,
    e.reported_equipment_status,
    e.reported_issue,
    e.reported_work,
    e.parts_requested,
    e.review_status as email_review_status,
    e.evidence_status as email_evidence_status,
    e.official_meter_written,
    m.gmail_message_id,
    m.email_sent_at,
    m.email_sender,
    m.email_subject,
    m.filename as email_filename,
    m.gmail_url
  from public.motil_email_equipment_meter_stage e
  join public.motil_email_source_manifest m
    on m.organization_id=e.organization_id
   and m.id=e.source_manifest_id
  where e.candidate_asset_id is not null
  order by e.organization_id,e.candidate_asset_id,
           e.report_date desc nulls last,
           m.email_sent_at desc nulls last,
           e.updated_at desc
),
latest_whatsapp as (
  select
    w.organization_id,
    w.asset_id as canonical_asset_id,
    w.operation_date,
    w.source_occurred_at,
    w.sender_name,
    w.whatsapp_group,
    w.description as whatsapp_description,
    w.event_class as whatsapp_event_class,
    w.evidence_state as whatsapp_evidence_state,
    w.stored_evidence_count as whatsapp_evidence_count
  from public.motil_whatsapp_asset_360_latest_v1 w
),
latest_status as (
  select distinct on (s.organization_id,s.asset_id)
    s.organization_id,
    s.asset_id as canonical_asset_id,
    s.new_state as canonical_status,
    s.reason as canonical_status_reason,
    s.changed_at as canonical_status_changed_at,
    s.source as canonical_status_source
  from public.maintenance_asset_status_history s
  order by s.organization_id,s.asset_id,s.changed_at desc,s.id desc
),
open_work_orders as (
  select
    w.organization_id,
    w.canonical_asset_id,
    count(*)::integer as open_work_orders,
    min(w.scheduled_date) filter (where w.scheduled_date is not null) as next_work_order_date,
    max(w.updated_at) as latest_work_order_update
  from public.maintenance_work_orders w
  where w.canonical_asset_id is not null
    and lower(coalesce(w.status,'')) not in ('completed','closed','cancelled','canceled')
  group by w.organization_id,w.canonical_asset_id
)
select
  a.organization_id,
  a.id as canonical_asset_id,
  a.asset_code,
  a.name as asset_name,
  a.is_active,
  a.validation_status,

  ls.canonical_status,
  ls.canonical_status_reason,
  ls.canonical_status_changed_at,
  ls.canonical_status_source,

  lp.mine_raw as site,
  lp.meter_unit as planning_meter_unit,
  lp.current_reading as planning_current_reading,
  lp.next_due_meter as planning_next_due_meter,
  lp.remaining_meter as planning_remaining_meter,
  lp.planning_priority,
  lp.recommended_action,
  lp.scheduled_date as planning_scheduled_date,
  lp.programming_status_raw,
  lp.responsible_raw,
  lp.parts_status_raw,
  lp.planning_observations,
  lp.planning_source_file,
  lp.planning_imported_at,

  le.report_date as email_report_date,
  le.email_sent_at,
  le.email_sender,
  le.email_subject,
  le.email_filename,
  le.gmail_message_id,
  le.gmail_url,
  le.email_meter_unit,
  le.email_meter_value,
  le.reported_mp_status,
  le.reported_equipment_status,
  le.reported_issue,
  le.reported_work,
  le.parts_requested,
  le.email_review_status,
  le.email_evidence_status,
  le.official_meter_written,

  lw.operation_date as whatsapp_operation_date,
  lw.source_occurred_at as whatsapp_occurred_at,
  lw.sender_name as whatsapp_sender_name,
  lw.whatsapp_group,
  lw.whatsapp_description,
  lw.whatsapp_event_class,
  lw.whatsapp_evidence_state,
  lw.whatsapp_evidence_count,

  coalesce(ow.open_work_orders,0) as open_work_orders,
  ow.next_work_order_date,
  ow.latest_work_order_update,

  greatest(
    coalesce(ls.canonical_status_changed_at,'epoch'::timestamptz),
    coalesce(lp.planning_imported_at,'epoch'::timestamptz),
    coalesce(le.email_sent_at,'epoch'::timestamptz),
    coalesce(lw.source_occurred_at,'epoch'::timestamptz),
    coalesce(ow.latest_work_order_update,'epoch'::timestamptz)
  ) as latest_signal_at,

  case
    when le.email_sent_at is not null
      and le.email_sent_at >= coalesce(lw.source_occurred_at,'epoch'::timestamptz)
      and le.email_sent_at >= coalesce(ls.canonical_status_changed_at,'epoch'::timestamptz)
      then 'email'
    when lw.source_occurred_at is not null
      and lw.source_occurred_at >= coalesce(ls.canonical_status_changed_at,'epoch'::timestamptz)
      then 'whatsapp'
    when ls.canonical_status_changed_at is not null then 'canonical_status'
    when lp.planning_imported_at is not null then 'planning_master'
    else 'asset_master'
  end as latest_signal_source
from public.maintenance_canonical_assets_v1 a
left join latest_planning lp
  on lp.organization_id=a.organization_id and lp.canonical_asset_id=a.id
left join latest_email le
  on le.organization_id=a.organization_id and le.canonical_asset_id=a.id
left join latest_whatsapp lw
  on lw.organization_id=a.organization_id and lw.canonical_asset_id=a.id
left join latest_status ls
  on ls.organization_id=a.organization_id and ls.canonical_asset_id=a.id
left join open_work_orders ow
  on ow.organization_id=a.organization_id and ow.canonical_asset_id=a.id
where a.is_active=true;

revoke all privileges on public.motil_maintenance_live_master_v1 from public,anon,authenticated;
grant select on public.motil_maintenance_live_master_v1 to service_role;

comment on view public.motil_maintenance_live_master_v1 is
  'Live maintenance master projection. Canonical asset/status truth stays separate from planning, email and WhatsApp evidence; latest_signal_source identifies the newest evidence channel without silently promoting observations to canonical state.';

commit;
