-- Cross-module, explicit HSE evidence links; applied to MOTIL Supabase.
create table if not exists canonical.hse_module_links (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 control_id uuid not null references canonical.hse_control_candidates(id),
 target_module text not null check(target_module in ('assets','maintenance','people','operations','legal')),
 target_record_id uuid not null,
 relationship_type text not null check(relationship_type in ('applies_to','requires_verification','supporting_evidence')),
 status text not null default 'pending' check(status in ('pending','verified','rejected')),
 created_by uuid,
 evidence_note text not null default '',
 created_at timestamptz not null default now(),
 unique(organization_id,control_id,target_module,target_record_id,relationship_type)
);
create index if not exists hse_module_links_target_idx on canonical.hse_module_links(organization_id,target_module,target_record_id);
create index if not exists hse_module_links_control_idx on canonical.hse_module_links(organization_id,control_id);
alter table canonical.hse_module_links enable row level security;
revoke all on canonical.hse_module_links from public,anon,authenticated;
grant select,insert on canonical.hse_module_links to service_role;
create or replace function public.list_hse_module_link_summary(p_org uuid)
returns table(target_module text,links bigint,pending bigint,verified bigint)
language sql security definer set search_path=pg_catalog
as $$
select target_module,count(*),count(*) filter(where status='pending'),count(*) filter(where status='verified')
from canonical.hse_module_links where organization_id=p_org group by target_module order by target_module
$$;
revoke all on function public.list_hse_module_link_summary(uuid) from public,anon,authenticated;
grant execute on function public.list_hse_module_link_summary(uuid) to service_role;
create or replace function public.propose_hse_module_link(p_org uuid,p_control uuid,p_module text,p_target uuid,p_actor uuid,p_note text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid;
begin
 if auth.role()<>'service_role' then raise exception 'service role only'; end if;
 if length(btrim(coalesce(p_note,'')))<5 then raise exception 'Evidence note required'; end if;
 if not exists(select 1 from canonical.hse_control_candidates where id=p_control and organization_id=p_org and validation_status='verified') then raise exception 'Control not verified'; end if;
 if p_module='assets' then
   if not exists(select 1 from public.canonical_assets_current where id=p_target and organization_id=p_org) then raise exception 'Asset not found'; end if;
 elsif p_module='people' then
   if not exists(select 1 from public.profiles where id=p_target and organization_id=p_org) then raise exception 'Person not found'; end if;
 elsif p_module='maintenance' then
   if not exists(select 1 from public.maintenance_assets where id=p_target and organization_id=p_org) then raise exception 'Maintenance asset not found'; end if;
 else raise exception 'Target module not yet supported';
 end if;
 insert into canonical.hse_module_links(organization_id,control_id,target_module,target_record_id,relationship_type,created_by,evidence_note)
 values(p_org,p_control,p_module,p_target,'requires_verification',p_actor,p_note)
 on conflict(organization_id,control_id,target_module,target_record_id,relationship_type)
 do update set evidence_note=excluded.evidence_note
 returning id into v_id;
 return v_id;
end;$$;
revoke all on function public.propose_hse_module_link(uuid,uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.propose_hse_module_link(uuid,uuid,text,uuid,uuid,text) to service_role;