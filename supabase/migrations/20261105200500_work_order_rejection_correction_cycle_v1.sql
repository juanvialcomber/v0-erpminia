begin;

alter table public.work_order_supervisor_reviews
  add column if not exists rejection_count integer not null default 0,
  add column if not exists last_rejected_at timestamptz,
  add column if not exists last_rejected_by_profile_id uuid,
  add column if not exists last_rejected_by_person_id uuid,
  add column if not exists last_rejected_by_name text,
  add column if not exists last_rejection_note text,
  add column if not exists resubmitted_at timestamptz;

alter table public.work_order_supervisor_reviews
  drop constraint if exists work_order_supervisor_reviews_status_check;

alter table public.work_order_supervisor_reviews
  add constraint work_order_supervisor_reviews_status_check
  check (status in ('pending','approved','rejected'));

create or replace function public.reject_work_order_supervisor_review_v1(
  p_organization_id uuid,
  p_work_order_id uuid,
  p_reviewer_profile_id uuid,
  p_decision_note text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_wo public.maintenance_work_orders%rowtype;
  v_reviewer public.people%rowtype;
  v_review public.work_order_supervisor_reviews%rowtype;
  v_note text := nullif(trim(p_decision_note), '');
  v_now timestamptz := now();
begin
  if v_note is null or length(v_note) < 5 then
    raise exception 'Indica qué debe corregir el mecánico antes de rechazar la OT'
      using errcode = '22023';
  end if;

  select * into v_reviewer
  from public.people pe
  where pe.organization_id = p_organization_id
    and pe.profile_id = p_reviewer_profile_id
    and pe.employment_status = 'active'
    and pe.full_name in ('Ariel López', 'Mauricio Astudillo')
  limit 1;

  if not found then
    raise exception 'Solo Ariel López o Mauricio Astudillo pueden rechazar la OT'
      using errcode = '42501';
  end if;

  select * into v_wo
  from public.maintenance_work_orders
  where organization_id = p_organization_id
    and id = p_work_order_id
  for update;

  if not found then
    raise exception 'La OT no existe en esta organización' using errcode = 'P0002';
  end if;
  if v_wo.created_by is null then
    raise exception 'La OT histórica es de solo lectura' using errcode = '55000';
  end if;
  if v_wo.status <> 'completed' then
    raise exception 'La OT debe estar cerrada para solicitar una corrección' using errcode = '55000';
  end if;

  select * into v_review
  from public.work_order_supervisor_reviews
  where organization_id = p_organization_id
    and work_order_id = p_work_order_id
  for update;

  if found and v_review.status = 'approved' then
    raise exception 'Una OT ya aprobada no puede rechazarse; requiere un flujo de corrección posterior separado'
      using errcode = '55000';
  end if;

  insert into public.work_order_supervisor_reviews (
    organization_id, work_order_id, status, decision_note,
    reviewed_by_profile_id, reviewed_by_person_id, reviewed_by_name, reviewed_at,
    rejection_count, last_rejected_at, last_rejected_by_profile_id,
    last_rejected_by_person_id, last_rejected_by_name, last_rejection_note,
    resubmitted_at, updated_at
  ) values (
    p_organization_id, p_work_order_id, 'rejected', v_note,
    p_reviewer_profile_id, v_reviewer.id, v_reviewer.full_name, v_now,
    1, v_now, p_reviewer_profile_id,
    v_reviewer.id, v_reviewer.full_name, v_note,
    null, v_now
  )
  on conflict (organization_id, work_order_id) do update set
    status = 'rejected',
    decision_note = excluded.decision_note,
    reviewed_by_profile_id = excluded.reviewed_by_profile_id,
    reviewed_by_person_id = excluded.reviewed_by_person_id,
    reviewed_by_name = excluded.reviewed_by_name,
    reviewed_at = excluded.reviewed_at,
    rejection_count = public.work_order_supervisor_reviews.rejection_count + 1,
    last_rejected_at = excluded.last_rejected_at,
    last_rejected_by_profile_id = excluded.last_rejected_by_profile_id,
    last_rejected_by_person_id = excluded.last_rejected_by_person_id,
    last_rejected_by_name = excluded.last_rejected_by_name,
    last_rejection_note = excluded.last_rejection_note,
    resubmitted_at = null,
    updated_at = excluded.updated_at
  returning * into v_review;

  update public.maintenance_work_orders
  set status = 'in_progress',
      completion_date = null,
      closed_at = null,
      closed_by = null,
      start_date = v_now,
      timer_status = 'idle',
      updated_at = v_now
  where organization_id = p_organization_id
    and id = p_work_order_id;

  insert into public.work_order_events (
    organization_id, work_order_id, canonical_asset_id, event_type, event_at,
    actor_id, actor_name, source_table, source_record_id, summary, payload
  ) values (
    p_organization_id, p_work_order_id, v_wo.canonical_asset_id,
    'supervisor_rejected_for_correction', v_now,
    p_reviewer_profile_id, v_reviewer.full_name,
    'public.work_order_supervisor_reviews', v_review.id::text,
    'Supervisión devolvió la OT al ejecutor para corrección',
    jsonb_build_object(
      'status', 'rejected',
      'note', v_note,
      'rejection_count', v_review.rejection_count,
      'assigned_person_id', v_wo.assigned_person_id,
      'previous_closed_at', v_wo.closed_at,
      'previous_closure_preserved', true
    )
  );

  return v_review.id;
end;
$function$;

revoke all on function public.reject_work_order_supervisor_review_v1(uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.reject_work_order_supervisor_review_v1(uuid,uuid,uuid,text)
  to service_role;

commit;
