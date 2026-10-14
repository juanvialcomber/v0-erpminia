-- Evidence graph is a read-only projection, not inferred operational assignments.
create or replace function public.list_hse_evidence_graph(p_org uuid)
returns table(source_type text,source_id uuid,relationship text,target_type text,target_id uuid,review_state text)
language sql security definer set search_path=pg_catalog as $$
 select 'document_fragment'::text,f.id,'supports_candidate'::text,'control_candidate'::text,c.id,c.validation_status::text
 from canonical.hse_control_candidates c
 join canonical.hse_document_fragments f on f.id=c.source_fragment_id and f.organization_id=c.organization_id
 where c.organization_id=p_org
 union all
 select 'verified_control'::text,c.id,'linked_to'::text,l.target_module::text,l.target_record_id,l.status::text
 from canonical.hse_module_links l
 join canonical.hse_control_candidates c on c.id=l.control_id and c.organization_id=l.organization_id
 where l.organization_id=p_org and l.status='verified' and c.validation_status='verified'
 limit 500;
$$;
revoke all on function public.list_hse_evidence_graph(uuid) from public,anon,authenticated;
grant execute on function public.list_hse_evidence_graph(uuid) to service_role;