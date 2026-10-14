-- Verified links only: excludes provisional HSE controls and unreviewed target links.
create or replace function public.list_hse_controls_for_target(p_org uuid,p_module text,p_target uuid)
returns table(control_id uuid,rule_code text,obligation text,link_status text,evidence_excerpt text,source_file_path text)
language sql security definer set search_path=pg_catalog as $$
 select c.id,c.rule_code,c.obligation,l.status,c.evidence_excerpt,f.source_file_path
 from canonical.hse_module_links l
 join canonical.hse_control_candidates c on c.id=l.control_id and c.organization_id=l.organization_id
 join canonical.hse_document_fragments f on f.id=c.source_fragment_id and f.organization_id=l.organization_id
 where l.organization_id=p_org and l.target_module=p_module and l.target_record_id=p_target
 and l.status='verified' and c.validation_status='verified'
 order by c.rule_code limit 100;
$$;
revoke all on function public.list_hse_controls_for_target(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.list_hse_controls_for_target(uuid,text,uuid) to service_role;
