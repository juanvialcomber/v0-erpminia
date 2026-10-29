-- Bodega stock source authority gate.
-- Laudus may be the primary information source only when its evidence is fresh
-- and no newer/unreconciled official email or later WhatsApp stock evidence exists.

create or replace view public.bodega_stock_source_authority_service_v1
with (security_invoker = true)
as
with orgs as (
  select organization_id
  from public.laudus_inventory_reconciliation_summary_service_v1
),
laudus as (
  select
    organization_id,
    max(latest_laudus_stock_sync) as latest_laudus_stock_sync,
    max(latest_laudus_stock_sync::date) as latest_laudus_stock_date
  from public.laudus_inventory_reconciliation_summary_service_v1
  group by organization_id
),
latest_email as (
  select
    m.organization_id,
    max(coalesce(m.source_cutoff_date, m.email_sent_at::date)) filter (
      where m.domain = 'warehouse'
        and m.download_state = 'downloaded'
    ) as latest_email_stock_cutoff
  from public.motil_email_source_manifest m
  group by m.organization_id
),
email_gate as (
  select
    e.organization_id,
    e.latest_email_stock_cutoff,
    count(m.*) filter (
      where m.domain = 'warehouse'
        and m.download_state = 'downloaded'
        and coalesce(m.source_cutoff_date, m.email_sent_at::date) = e.latest_email_stock_cutoff
        and coalesce(m.ingest_state, '') not in ('reconciled','promoted','completed')
    )::bigint as latest_email_pending_reconciliation
  from latest_email e
  left join public.motil_email_source_manifest m
    on m.organization_id = e.organization_id
  group by e.organization_id, e.latest_email_stock_cutoff
),
whatsapp_gate as (
  select
    l.organization_id,
    max(w.occurred_at) filter (
      where w.occurred_at > l.latest_laudus_stock_sync
        and (
          lower(coalesce(w.body,'')) ~ '(petróleo|petroleo|diesel|existencia[s]?)'
          or (
            lower(coalesce(w.body,'')) ~ '(bodega)'
            and lower(coalesce(w.body,'')) ~ '([0-9]+([\.,][0-9]+)?[[:space:]]*(l|lt|lts|litro|litros|kg|kilo|kilos|unidad|unidades))'
          )
        )
    ) as latest_whatsapp_stock_evidence,
    count(w.*) filter (
      where w.occurred_at > l.latest_laudus_stock_sync
        and (
          lower(coalesce(w.body,'')) ~ '(petróleo|petroleo|diesel|existencia[s]?)'
          or (
            lower(coalesce(w.body,'')) ~ '(bodega)'
            and lower(coalesce(w.body,'')) ~ '([0-9]+([\.,][0-9]+)?[[:space:]]*(l|lt|lts|litro|litros|kg|kilo|kilos|unidad|unidades))'
          )
        )
    )::bigint as whatsapp_stock_evidence_since_laudus
  from laudus l
  left join public.motil_whatsapp_messages w
    on w.organization_id = l.organization_id
  group by l.organization_id
)
select
  o.organization_id,
  l.latest_laudus_stock_sync,
  l.latest_laudus_stock_date,
  e.latest_email_stock_cutoff,
  coalesce(e.latest_email_pending_reconciliation, 0)::bigint as latest_email_pending_reconciliation,
  w.latest_whatsapp_stock_evidence,
  coalesce(w.whatsapp_stock_evidence_since_laudus, 0)::bigint as whatsapp_stock_evidence_since_laudus,
  case
    when l.latest_laudus_stock_sync is null then 'review_laudus_unavailable'
    when now() - l.latest_laudus_stock_sync > interval '8 hours' then 'review_laudus_stale'
    when coalesce(e.latest_email_pending_reconciliation, 0) > 0
      and e.latest_email_stock_cutoff is not null
      and e.latest_email_stock_cutoff >= l.latest_laudus_stock_date
      then 'review_official_email'
    when coalesce(w.whatsapp_stock_evidence_since_laudus, 0) > 0
      then 'review_whatsapp_evidence'
    else 'laudus_primary'
  end as authority_state,
  case
    when l.latest_laudus_stock_sync is null then 'Sin snapshot Laudus disponible.'
    when now() - l.latest_laudus_stock_sync > interval '8 hours' then 'Laudus requiere refresco antes de usarlo como fuente primaria.'
    when coalesce(e.latest_email_pending_reconciliation, 0) > 0
      and e.latest_email_stock_cutoff is not null
      and e.latest_email_stock_cutoff >= l.latest_laudus_stock_date
      then 'Existe evidencia oficial de Bodega por correo pendiente de conciliación contra Laudus.'
    when coalesce(w.whatsapp_stock_evidence_since_laudus, 0) > 0
      then 'Existe evidencia operacional WhatsApp posterior al último stock Laudus.'
    else 'Laudus es la fuente primaria de stock; las demás fuentes actúan como contraste.'
  end as authority_reason
from orgs o
left join laudus l on l.organization_id = o.organization_id
left join email_gate e on e.organization_id = o.organization_id
left join whatsapp_gate w on w.organization_id = o.organization_id;

revoke all on public.bodega_stock_source_authority_service_v1 from public, anon, authenticated;
grant select on public.bodega_stock_source_authority_service_v1 to service_role;

comment on view public.bodega_stock_source_authority_service_v1 is
  'Server-only Bodega stock source authority gate. Laudus becomes primary only when fresh and no newer unresolved warehouse email or later WhatsApp inventory evidence requires reconciliation. Mineral/production stock is excluded from this authority domain.';
