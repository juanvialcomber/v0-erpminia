begin;

insert into public.document_intake_entity_links
(organization_id,intake_item_id,entity_type,entity_id,relation_type,source_sheet,source_row,source_key,promotion_status,notes)
select s.organization_id,
       '53237066-24a7-496b-9b01-856008e538a7'::uuid,
       'transport_settlement',
       s.id,
       'supersedes',
       s.source_sheet,
       s.source_row,
       s.source_fingerprint,
       'rejected',
       'Legacy duplicate superseded by the promoted canonical row for the same normalized source sheet + source row.'
from public.transport_settlements s
where s.organization_id='2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee'
  and s.source_file='5. Liquidación a tranportistas 2022-2023-2024-2025-2026.xlsx'
  and not exists (
    select 1
    from public.document_intake_entity_links l
    where l.organization_id=s.organization_id
      and l.intake_item_id='53237066-24a7-496b-9b01-856008e538a7'::uuid
      and l.entity_type='transport_settlement'
      and l.entity_id=s.id
      and l.relation_type='derived_from'
      and l.promotion_status='promoted'
  )
on conflict (organization_id,intake_item_id,entity_type,entity_id,relation_type)
do update set promotion_status='rejected',
              source_sheet=excluded.source_sheet,
              source_row=excluded.source_row,
              source_key=excluded.source_key,
              notes=excluded.notes,
              updated_at=now();

create or replace view public.transport_settlements_canonical_v1
with (security_invoker=true)
as
select s.*
from public.transport_settlements s
join public.document_intake_entity_links l
  on l.organization_id=s.organization_id
 and l.entity_type='transport_settlement'
 and l.entity_id=s.id
 and l.relation_type='derived_from'
 and l.promotion_status='promoted';

create or replace view public.transport_settlement_components_canonical_v1
with (security_invoker=true)
as
select c.*
from public.transport_settlement_components c
join public.transport_settlements_canonical_v1 s
  on s.id=c.settlement_id
 and s.organization_id=c.organization_id;

grant select on public.transport_settlements_canonical_v1 to authenticated;
grant select on public.transport_settlement_components_canonical_v1 to authenticated;

comment on view public.transport_settlements_canonical_v1 is
  'Canonical transport settlement projection: only rows promoted through immutable document intake lineage.';
comment on view public.transport_settlement_components_canonical_v1 is
  'Canonical transport settlement components restricted to promoted settlement lineage.';

commit;
