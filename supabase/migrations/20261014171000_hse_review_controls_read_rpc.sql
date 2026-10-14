-- Read-only service-role RPC; the Next.js route checks user role and organization first.
create or replace function public.list_hse_review_controls(p_organization_id uuid)
returns table(id uuid,rule_code text,domain text,obligation text,responsible_role text,evidence_excerpt text,validation_status text,source_file_path text)
language sql security definer set search_path=pg_catalog
as $$
 select c.id,c.rule_code,c.domain,c.obligation,c.responsible_role,c.evidence_excerpt,c.validation_status,f.source_file_path
 from canonical.hse_control_candidates c
 join canonical.hse_document_fragments f on f.id=c.source_fragment_id
 where c.organization_id=p_organization_id and f.organization_id=p_organization_id
 order by c.rule_code limit 200;
$$;
revoke all on function public.list_hse_review_controls(uuid) from public,anon,authenticated;
grant execute on function public.list_hse_review_controls(uuid) to service_role;
