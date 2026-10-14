-- HSE reviews: applied to MOTIL via migration hse_control_audited_review_20261014.
create table if not exists canonical.hse_control_review_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 control_id uuid not null references canonical.hse_control_candidates(id),
 reviewer_user_id uuid not null,
 old_status text not null,
 new_status text not null check(new_status in ('verified','rejected','pending')),
 review_note text not null check(length(btrim(review_note))>=5),
 created_at timestamptz not null default now()
);
create index if not exists hse_control_review_events_org_control on canonical.hse_control_review_events(organization_id,control_id,created_at desc);
alter table canonical.hse_control_review_events enable row level security;
revoke all on canonical.hse_control_review_events from anon,authenticated;
grant select on canonical.hse_control_review_events to service_role;
create or replace function public.review_hse_control(p_organization_id uuid,p_control_id uuid,p_reviewer_user_id uuid,p_new_status text,p_note text)
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare v_old text;
begin
 if auth.role()<>'service_role' then raise exception 'service role only'; end if;
 if p_new_status not in ('verified','rejected','pending') or length(btrim(coalesce(p_note,'')))<5 then raise exception 'Invalid review'; end if;
 select validation_status into v_old from canonical.hse_control_candidates where id=p_control_id and organization_id=p_organization_id for update;
 if not found then raise exception 'Control not found'; end if;
 if v_old=p_new_status then raise exception 'Status unchanged'; end if;
 update canonical.hse_control_candidates set validation_status=p_new_status where id=p_control_id and organization_id=p_organization_id;
 insert into canonical.hse_control_review_events(organization_id,control_id,reviewer_user_id,old_status,new_status,review_note)
 values(p_organization_id,p_control_id,p_reviewer_user_id,v_old,p_new_status,p_note);
 return p_new_status;
end;$$;
revoke all on function public.review_hse_control(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_hse_control(uuid,uuid,uuid,text,text) to service_role;