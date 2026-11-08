-- MOTIL Source Authority + Freshness v1
-- Additive control-plane metadata only. No canonical business state is rewritten.

insert into integration.external_sources (
  organization_id, source_key, display_name, mode, enabled, config, updated_at
)
values
  ('2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee','motil_native','MOTIL operativo','read_write',true,
   '{"authority":"motil_operational","write_back":true,"freshness_sla_minutes":1440}'::jsonb,now()),
  ('2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee','whatsapp_greenapi','WhatsApp operacional','read_only',true,
   '{"authority":"source_evidence","provider":"green_api","write_back":false,"freshness_sla_minutes":120}'::jsonb,now()),
  ('2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee','gmail_lapatagua','Correo La Patagua','read_only',true,
   '{"authority":"source_evidence","provider":"gmail","write_back":false,"freshness_sla_minutes":1440}'::jsonb,now()),
  ('2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee','document_intake','Documentos MOTIL','read_write',true,
   '{"authority":"source_evidence","write_back":false,"freshness_sla_minutes":1440}'::jsonb,now()),
  ('2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee','production_files','Archivos operacionales','read_only',true,
   '{"authority":"source_evidence","write_back":false,"freshness_sla_minutes":10080}'::jsonb,now())
on conflict (organization_id,source_key) do update
set display_name=excluded.display_name,
    mode=excluded.mode,
    enabled=excluded.enabled,
    config=integration.external_sources.config || excluded.config,
    updated_at=now();

create table if not exists integration.source_authority_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  domain text not null,
  authority_mode text not null
    check (authority_mode in ('READ','PREPARE','WRITE_GATED','MOTIL_CANONICAL','LAUDUS_CANONICAL')),
  primary_source_key text not null,
  secondary_source_keys text[] not null default '{}',
  freshness_sla_minutes integer not null check (freshness_sla_minutes > 0),
  freshness_kind text not null default 'source_observation'
    check (freshness_kind in ('source_observation','business_event','native_activity')),
  owner_cargo text,
  auto_promote boolean not null default false,
  conflict_policy text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,domain),
  foreign key (organization_id,primary_source_key)
    references integration.external_sources(organization_id,source_key)
);

revoke all on integration.source_authority_contracts from public, anon, authenticated;
grant select, insert, update on integration.source_authority_contracts to service_role;

insert into integration.source_authority_contracts (
  organization_id,domain,authority_mode,primary_source_key,secondary_source_keys,
  freshness_sla_minutes,freshness_kind,owner_cargo,auto_promote,conflict_policy,notes,updated_at
)
values
  ('2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee','maintenance','MOTIL_CANONICAL','motil_native',
   array['whatsapp_greenapi','gmail_lapatagua','document_intake'],1440,'native_activity','Jefe Departamento de Mantenimiento',false,
   'Preservar evidencia; conflicto material requiere revisión humana.',
   'OT, ejecución, pausas, evidencias y cierre operacional pertenecen a MOTIL.',now()),
  ('2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee','weekly_planning','MOTIL_CANONICAL','gmail_lapatagua',
   array['production_files','motil_native'],10080,'business_event','Jefe de Planificación',false,
   'La fuente oficial más reciente validada prevalece; no inferir aprobación por silencio.',
   'Planificación semanal se origina en evidencia de Ariel y se promueve a MOTIL con trazabilidad.',now()),
  ('2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee','production','MOTIL_CANONICAL','production_files',
   array['whatsapp_greenapi','gmail_lapatagua','motil_native'],1440,'business_event','Gerente de Operaciones',false,
   'No reemplazar dato reportado por inferencia; reconciliar versiones y cortes.',
   'Producción operacional debe quedar gobernada por fuentes y registros MOTIL.',now()),
  ('2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee','inventory','MOTIL_CANONICAL','motil_native',
   array['laudus','gmail_lapatagua','document_intake'],2880,'business_event','JEFE BODEGA',false,
   'Stock físico/canónico MOTIL no se sobrescribe por discrepancia Laudus; crear revisión.',
   'Laudus pasa a contraste de stock y movimientos, no autoridad operacional única.',now()),
  ('2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee','procurement','PREPARE','motil_native',
   array['laudus','gmail_lapatagua','document_intake'],1440,'native_activity','JEFE BODEGA',false,
   'MOTIL prepara y reconcilia; recepciones, facturas y compromisos no se colapsan en un solo estado.',
   'Transición progresiva hacia compras operacionales en MOTIL.',now()),
  ('2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee','product_master','MOTIL_CANONICAL','motil_native',
   array['laudus','gmail_lapatagua'],43200,'native_activity','JEFE BODEGA',false,
   'Alias o identidad dudosa queda en revisión; nunca fuzzy auto-match.',
   'MOTIL mantiene el maestro operacional enriquecido; Laudus es fuente secundaria.',now()),
  ('2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee','finance_accounting','LAUDUS_CANONICAL','laudus',
   array['gmail_lapatagua','document_intake'],1440,'source_observation','Gerente de Finanzas',false,
   'Contabilidad, DTE y pago se mantienen separados y bajo autoridad financiera.',
   'MOTIL consume y explica; no sustituye aún la autoridad contable/tributaria de Laudus.',now()),
  ('2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee','bank_reconciliation','PREPARE','laudus',
   array['gmail_lapatagua','document_intake'],1440,'business_event','Gerente de Finanzas',false,
   'Deposited no equivale a conciliado bancariamente; exigir cartola/evidencia bancaria.',
   'MOTIL prepara conciliación; cierre humano y evidencia bancaria siguen siendo obligatorios.',now()),
  ('2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee','legal_documents','MOTIL_CANONICAL','document_intake',
   array['gmail_lapatagua'],10080,'source_observation','Responsable de Legal',false,
   'Preservar versión, aprobación y evidencia; no inferir vigencia contractual.',
   'Expediente y control documental operacional pertenecen a MOTIL.',now())
on conflict (organization_id,domain) do update
set authority_mode=excluded.authority_mode,
    primary_source_key=excluded.primary_source_key,
    secondary_source_keys=excluded.secondary_source_keys,
    freshness_sla_minutes=excluded.freshness_sla_minutes,
    freshness_kind=excluded.freshness_kind,
    owner_cargo=excluded.owner_cargo,
    auto_promote=excluded.auto_promote,
    conflict_policy=excluded.conflict_policy,
    notes=excluded.notes,
    updated_at=now();

create or replace view public.motil_source_authority_service_v1
with (security_invoker = true)
as
with probes as (
  select organization_id,'maintenance'::text domain,
         max(updated_at::timestamptz) observed_at,
         max(coalesce(closed_at,created_at::timestamptz)) source_event_at,
         count(*)::bigint record_count,
         count(*) filter (where status in ('open','in_progress'))::bigint pending_count
  from public.maintenance_work_orders
  group by organization_id

  union all

  select organization_id,'weekly_planning',
         max(imported_at),max(reported_at),count(*)::bigint,
         count(*) filter (where status='review_required')::bigint
  from public.planning_weekly_work_sources
  group by organization_id

  union all

  select organization_id,'production',
         max(updated_at),max(period_end::timestamptz),count(*)::bigint,
         count(*) filter (where status not in ('imported','analyzed','approved_for_import'))::bigint
  from public.production_import_batches
  group by organization_id

  union all

  select organization_id,'inventory',
         max(snapshot_date::timestamptz),max(snapshot_date::timestamptz),count(*)::bigint,
         count(*) filter (where validation_status not in ('verified','valid','approved'))::bigint
  from public.canonical_inventory_current
  group by organization_id

  union all

  select organization_id,'procurement',
         max(created_at),max(created_at),count(*)::bigint,
         count(*) filter (where status not in ('completed','closed','cancelled','rejected'))::bigint
  from public.procurement_intake_flow
  group by organization_id

  union all

  select organization_id,'product_master',
         max(updated_at),max(updated_at),count(*)::bigint,
         count(*) filter (where validation_status not in ('verified','valid','approved'))::bigint
  from canonical.products
  where is_active=true
  group by organization_id

  union all

  select s.organization_id,'finance_accounting',
         max(s.last_success_at),max(s.freshness_observed_at),
         coalesce(sum(s.records_processed),0)::bigint,
         coalesce(sum(s.conflicts),0)::bigint
  from integration.sync_domain_state s
  join integration.external_sources e on e.id=s.source_id and e.source_key='laudus'
  where s.domain in ('accounting_entries','financial_masters')
  group by s.organization_id

  union all

  select b.organization_id,'bank_reconciliation',
         max(b.synced_at),max(b.date_to::timestamptz),count(*)::bigint,0::bigint
  from integration.laudus_bank_statements b
  group by b.organization_id

  union all

  select organization_id,'legal_documents',
         max(coalesce(linked_at,classified_at,created_at)),max(created_at),count(*)::bigint,
         count(*) filter (where status='pending_classification')::bigint
  from public.document_intake_items
  where lower(coalesce(area,'')) in ('legal','juridico','jurídico')
  group by organization_id
)
select
  c.organization_id,
  c.domain,
  c.authority_mode,
  c.primary_source_key,
  c.secondary_source_keys,
  c.freshness_sla_minutes,
  c.freshness_kind,
  c.owner_cargo,
  c.auto_promote,
  c.conflict_policy,
  c.notes,
  p.observed_at,
  p.source_event_at,
  coalesce(p.record_count,0) record_count,
  coalesce(p.pending_count,0) pending_count,
  case
    when c.freshness_kind='business_event' then p.source_event_at
    else p.observed_at
  end as effective_freshness_at,
  case
    when p.observed_at is null and p.source_event_at is null then 'unknown'
    when coalesce(p.pending_count,0) > 0 then 'requires_review'
    when c.freshness_kind='native_activity' then 'current'
    when coalesce(
      case when c.freshness_kind='business_event' then p.source_event_at else p.observed_at end,
      p.observed_at,
      p.source_event_at
    ) < now() - make_interval(mins => c.freshness_sla_minutes) then 'stale'
    else 'fresh'
  end as freshness_status,
  now() as evaluated_at
from integration.source_authority_contracts c
left join probes p
  on p.organization_id=c.organization_id
 and p.domain=c.domain;

revoke all on public.motil_source_authority_service_v1 from public, anon, authenticated;
grant select on public.motil_source_authority_service_v1 to service_role;

update integration.external_sources
set config = config || '{"freshness_sla_minutes":1440}'::jsonb,
    updated_at=now()
where organization_id='2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee'
  and source_key='laudus';

create or replace view public.motil_channel_health_service_v1
with (security_invoker = true)
as
with stats as (
  select organization_id,'whatsapp_greenapi'::text source_key,
         max(received_at) observed_at,max(occurred_at) source_event_at,
         count(*)::bigint record_count,
         (select coalesce(sum(problematic_attachment_count),0)::bigint
          from public.motil_whatsapp_intake_exceptions_v1 x
          where x.organization_id=m.organization_id
            and x.disposition in ('media_processing_issue','unclassified')) pending_count
  from public.motil_whatsapp_messages m
  group by organization_id

  union all

  select organization_id,'gmail_lapatagua',
         max(updated_at),max(email_sent_at),count(*)::bigint,
         count(*) filter (
           where download_state='pending'
              or ingest_state not in ('catalogued','staged','source_only')
         )::bigint
  from public.motil_email_source_manifest
  group by organization_id

  union all

  select organization_id,'document_intake',
         max(coalesce(linked_at,classified_at,created_at)),max(created_at),count(*)::bigint,
         count(*) filter (where status='pending_classification')::bigint
  from public.document_intake_items
  group by organization_id

  union all

  select organization_id,'production_files',
         max(updated_at),max(period_end::timestamptz),count(*)::bigint,
         count(*) filter (where status not in ('imported','analyzed','approved_for_import'))::bigint
  from public.production_import_batches
  group by organization_id

  union all

  select organization_id,'motil_native',
         greatest(
           (select max(updated_at::timestamptz) from public.maintenance_work_orders w where w.organization_id=p.organization_id),
           (select max(created_at) from public.procurement_intake_flow q where q.organization_id=p.organization_id),
           max(p.updated_at)
         ),
         greatest(
           (select max(coalesce(closed_at,created_at::timestamptz)) from public.maintenance_work_orders w where w.organization_id=p.organization_id),
           (select max(created_at) from public.procurement_intake_flow q where q.organization_id=p.organization_id),
           max(p.updated_at)
         ),
         count(*)::bigint,
         0::bigint
  from canonical.products p
  where p.is_active=true
  group by organization_id

  union all

  select s.organization_id,'laudus',
         max(s.last_success_at),max(s.freshness_observed_at),
         coalesce(sum(s.records_processed),0)::bigint,
         coalesce(sum(s.conflicts),0)::bigint
  from integration.sync_domain_state s
  join integration.external_sources e on e.id=s.source_id and e.source_key='laudus'
  group by s.organization_id
)
select
  e.organization_id,
  e.source_key,
  e.display_name,
  e.mode,
  e.enabled,
  s.observed_at,
  s.source_event_at,
  coalesce(s.record_count,0) record_count,
  coalesce(s.pending_count,0) pending_count,
  nullif(e.config->>'freshness_sla_minutes','')::integer freshness_sla_minutes,
  case
    when not e.enabled then 'disabled'
    when s.observed_at is null then 'unknown'
    when coalesce(s.pending_count,0) > 0 then 'degraded'
    when e.source_key='motil_native' then 'healthy'
    when s.observed_at < now() - make_interval(mins => coalesce(nullif(e.config->>'freshness_sla_minutes','')::integer,1440)) then 'stale'
    else 'healthy'
  end as health_status,
  now() evaluated_at
from integration.external_sources e
left join stats s
  on s.organization_id=e.organization_id
 and s.source_key=e.source_key;

revoke all on public.motil_channel_health_service_v1 from public, anon, authenticated;
grant select on public.motil_channel_health_service_v1 to service_role;
