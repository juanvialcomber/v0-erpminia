-- Ensure operational freshness tasks always have a real active owner.
-- Plant/drilling tasks fall back to Gerente de Operaciones only while the source cargo has no active profile.

-- Gate negative-stock human tasks behind automatic Kardex evidence. The system investigates first; Bodega acts only after evidence exists.

-- Keep only genuinely actionable work in Mi trabajo. Laudus fixed-asset source backlog remains visible in its domain screens but is not a human task.

-- Financial reconciliation readiness: Laudus payment data is current, but bank
-- statement evidence is historical. Keep one accountable gap instead of pretending
-- bank reconciliation is available.

create or replace view public.laudus_bank_reconciliation_readiness_v1
with (security_invoker = true)
as
with payments as (
  select
    organization_id,
    count(*) as payment_count,
    count(*) filter (where deposited=true) as deposited_count,
    min(issued_date) as min_payment_date,
    max(issued_date) as max_payment_date,
    max(synced_at) as latest_payment_sync
  from integration.laudus_purchase_payments
  group by organization_id
),
statements as (
  select
    organization_id,
    count(*) as statement_count,
    min(date_from) as min_statement_from,
    max(date_to) as max_statement_to,
    max(synced_at) as latest_statement_sync
  from integration.laudus_bank_statements
  group by organization_id
)
select
  p.organization_id,
  p.payment_count,
  p.deposited_count,
  p.min_payment_date,
  p.max_payment_date,
  p.latest_payment_sync,
  coalesce(s.statement_count,0) as statement_count,
  s.min_statement_from,
  s.max_statement_to,
  s.latest_statement_sync,
  case
    when coalesce(s.statement_count,0)=0 then 'missing_bank_evidence'
    when s.max_statement_to is null then 'missing_bank_evidence'
    when p.max_payment_date is not null and s.max_statement_to < p.max_payment_date - interval '30 days'
      then 'stale_bank_evidence'
    else 'covered'
  end as readiness_state,
  case
    when coalesce(s.statement_count,0)=0 then true
    when s.max_statement_to is null then true
    when p.max_payment_date is not null and s.max_statement_to < p.max_payment_date - interval '30 days'
      then true
    else false
  end as human_action_now
from payments p
left join statements s on s.organization_id=p.organization_id;

revoke all on public.laudus_bank_reconciliation_readiness_v1 from public, anon, authenticated;
grant select on public.laudus_bank_reconciliation_readiness_v1 to service_role;

-- Route Finance Laudus review work to the real Administration & Finance owner.
-- Daniel Villarroel is assigned to cargo GERENTE DE FINANZAS; JEFE ADM. currently has no profile.
-- This changes task ownership only. No financial or Laudus mutation is performed.

create or replace view public.role_tasks_by_cargo_v1
with (security_invoker = true)
as
select
  t.organization_id,
  case
    when t.responsibility='owner'
      and t.domain in ('plant','drilling')
      and not exists (
        select 1
        from public.profiles p
        where p.organization_id=t.organization_id
          and p.cargo_id=t.cargo_id
          and p.status='active'
      )
      and exists (
        select 1
        from public.profiles p
        where p.organization_id=t.organization_id
          and p.cargo_id=fallback.id
          and p.status='active'
      )
    then fallback.id
    else t.cargo_id
  end as cargo_id,
  case
    when t.responsibility='owner'
      and t.domain in ('plant','drilling')
      and not exists (
        select 1
        from public.profiles p
        where p.organization_id=t.organization_id
          and p.cargo_id=t.cargo_id
          and p.status='active'
      )
      and exists (
        select 1
        from public.profiles p
        where p.organization_id=t.organization_id
          and p.cargo_id=fallback.id
          and p.status='active'
      )
    then fallback.name
    else t.cargo_name
  end as cargo_name,
  t.task_key,
  t.domain,
  t.severity,
  t.priority_score,
  t.title,
  t.evidence_summary,
  t.status,
  t.material_related,
  t.occurred_at,
  t.recommended_action,
  t.responsibility,
  case
    when t.responsibility='owner'
      and t.domain in ('plant','drilling')
      and not exists (
        select 1
        from public.profiles p
        where p.organization_id=t.organization_id
          and p.cargo_id=t.cargo_id
          and p.status='active'
      )
      and exists (
        select 1
        from public.profiles p
        where p.organization_id=t.organization_id
          and p.cargo_id=fallback.id
          and p.status='active'
      )
    then concat(
      'Escalación temporal por cargo sin persona activa (', t.cargo_name, '). ',
      t.role_action,
      ' La tarea vuelve automáticamente al cargo original cuando tenga un perfil activo.'
    )
    else t.role_action
  end as role_action,
  'operational'::text as visibility_scope
from public.operational_tasks_by_cargo_v9 t
join public.cargos fallback on upper(fallback.name)='GERENTE DE OPERACIONES'

union all

select
  f.organization_id,
  c.id as cargo_id,
  c.name as cargo_name,
  'finance:'::text || coalesce(f.alert_code, md5(coalesce(f.title, ''))) as task_key,
  'finance'::text as domain,
  coalesce(f.severity, 'warning'::text) as severity,
  case lower(coalesce(f.severity, 'warning'::text))
    when 'critical' then 95
    when 'warning' then 60
    else 30
  end as priority_score,
  f.title,
  concat_ws(' · ', nullif(f.description, ''), 'casos ' || coalesce(f.exception_count, 0)::text) as evidence_summary,
  'pending'::text as status,
  false as material_related,
  null::timestamptz as occurred_at,
  'review_finance_exception'::text as recommended_action,
  'owner'::text as responsibility,
  'Resolver dentro de Administración y Finanzas; aprobar o rechazar con razón cuando la evidencia no permita una resolución determinística.'::text as role_action,
  'role_private'::text as visibility_scope
from public.canonical_finance_alerts f
join public.cargos c on upper(c.name) = 'GERENTE DE FINANZAS'
where coalesce(f.exception_count, 0) > 0

union all

select
  r.organization_id,
  c.id as cargo_id,
  c.name as cargo_name,
  'reorder:'::text || r.id::text as task_key,
  'inventory'::text as domain,
  'warning'::text as severity,
  60 as priority_score,
  'Revisar reposición de inventario'::text as title,
  concat_ws(' · ', 'actual ' || coalesce(r.current_value, 0)::text, 'umbral ' || coalesce(r.threshold_value, 0)::text) as evidence_summary,
  coalesce(r.status, 'pending'::text) as status,
  true as material_related,
  r.created_at::timestamptz as occurred_at,
  'review_reorder_alert'::text as recommended_action,
  'owner'::text as responsibility,
  'Revisar en Bodega. Sólo escalar si bloquea una OT u operación activa.'::text as role_action,
  'role_private'::text as visibility_scope
from public.reorder_alerts r
join public.cargos c on upper(c.name) = 'JEFE BODEGA'
where coalesce(r.status, 'pending'::text) <> all (array['resolved','closed','dismissed','acknowledged'])

union all

select
  d.organization_id,
  c.id as cargo_id,
  c.name as cargo_name,
  'laudus-reconciliation:'::text || d.id::text as task_key,
  'inventory'::text as domain,
  case
    when d.issue_key like 'laudus:negative_stock:%' then 'critical'::text
    else 'warning'::text
  end as severity,
  case
    when d.issue_key like 'laudus:negative_stock:%' then 90
    else 70
  end as priority_score,
  case
    when d.issue_key like 'laudus:negative_stock:%' then 'Conciliar stock negativo Laudus'
    else 'Conciliar diferencia MOTIL vs Laudus'
  end as title,
  concat_ws(
    ' · ',
    case
      when d.issue_key like 'laudus:negative_stock:%' then 'Saldo negativo requiere decisión humana'
      else 'Diferencia de inventario requiere decisión humana'
    end,
    nullif(d.evidence_reference, '')
  ) as evidence_summary,
  'pending'::text as status,
  true as material_related,
  coalesce(d.updated_at, d.created_at) as occurred_at,
  'review_laudus_inventory_reconciliation'::text as recommended_action,
  'owner'::text as responsibility,
  'Abrir Bodega y aprobar o rechazar la evidencia Laudus con una razón obligatoria. La decisión no modifica stock automáticamente.'::text as role_action,
  'role_private'::text as visibility_scope
from public.data_reconciliation_reviews d
join public.cargos c on upper(c.name) = 'JEFE BODEGA'
where d.status = 'open'
  and (
    d.issue_key like 'laudus:inventory_mismatch:%'
    or d.issue_key like 'laudus:negative_stock:%'
  )
  and (
    d.issue_key not like 'laudus:negative_stock:%'
    or exists (
      select 1
      from public.laudus_negative_stock_positions_service_v1 n
      join public.laudus_product_kardex_latest_service_v1 k
        on k.organization_id=n.organization_id
       and k.product_external_id=n.product_external_id
      where n.organization_id=d.organization_id
        and upper(n.sku)=upper(split_part(d.issue_key, ':', 3))
    )
  )

union all

select
  d.organization_id,
  c.id as cargo_id,
  c.name as cargo_name,
  'laudus-finance-reconciliation:'::text || d.id::text as task_key,
  'finance'::text as domain,
  case
    when d.issue_key like 'laudus:cxp_inconsistente:%' then 'warning'::text
    when d.issue_key like 'laudus:purchase_order_unresolved:%' then 'warning'::text
    when d.issue_key like 'laudus:cost_center_pending:%' then 'warning'::text
    else 'observation'::text
  end as severity,
  case
    when d.issue_key like 'laudus:cxp_inconsistente:%' then 75
    when d.issue_key like 'laudus:purchase_order_unresolved:%' then 70
    when d.issue_key like 'laudus:cost_center_pending:%' then 72
    else 55
  end as priority_score,
  case
    when d.issue_key like 'laudus:cxp_inconsistente:%' then 'Conciliar CxP Laudus'
    when d.issue_key like 'laudus:purchase_order_unresolved:%' then 'Conciliar OC Laudus'
    when d.issue_key like 'laudus:cost_center_pending:%' then 'Conciliar centro de costo Laudus'
    else 'Revisar trazabilidad de factura Laudus'
  end as title,
  concat_ws(
    ' · ',
    case
      when d.issue_key like 'laudus:cxp_inconsistente:%' then 'La fuente financiera presenta una inconsistencia que requiere decisión humana'
      when d.issue_key like 'laudus:purchase_order_unresolved:%' then 'La OC no tiene centro de costo resoluble y requiere decisión administrativa'
      when d.issue_key like 'laudus:cost_center_pending:%' then 'El centro de costo Laudus no tiene identidad operacional confirmada y requiere decisión administrativa con evidencia operacional'
      else 'La trazabilidad de factura requiere revisión humana'
    end,
    nullif(d.evidence_reference, '')
  ) as evidence_summary,
  'pending'::text as status,
  false as material_related,
  coalesce(d.updated_at, d.created_at) as occurred_at,
  'review_laudus_finance_reconciliation'::text as recommended_action,
  'owner'::text as responsibility,
  'Abrir Finanzas y aprobar o rechazar con razón obligatoria. La decisión no modifica pagos, facturas, asientos ni Laudus automáticamente.'::text as role_action,
  'role_private'::text as visibility_scope
from public.data_reconciliation_reviews d
join public.cargos c on upper(c.name) = 'GERENTE DE FINANZAS'
where d.status = 'open'
  and (
    d.issue_key like 'laudus:cxp_inconsistente:%'
    or d.issue_key like 'laudus:open_invoice_trace_once:%'
    or d.issue_key like 'laudus:purchase_order_unresolved:%'
    or d.issue_key like 'laudus:cost_center_pending:%'
  )

union all

select
  d.organization_id,
  c.id as cargo_id,
  c.name as cargo_name,
  'laudus-fixed-asset:'::text || split_part(d.issue_key, ':', 3) as task_key,
  'maintenance'::text as domain,
  case
    when d.evidence_reference like '%evidence=strong_identifier_candidate%' then 'warning'::text
    else 'info'::text
  end as severity,
  case
    when d.evidence_reference like '%evidence=strong_identifier_candidate%' then 80
    else 60
  end as priority_score,
  'Confirmar identidad de activo Laudus'::text as title,
  d.evidence_reference as evidence_summary,
  'pending'::text as status,
  false as material_related,
  d.created_at as occurred_at,
  'review_laudus_fixed_asset_identity'::text as recommended_action,
  'owner'::text as responsibility,
  'Abrir Mantenimiento > Activos Laudus y confirmar, rechazar o diferir el candidato. La decisión no modifica automáticamente el maestro MOTIL ni Laudus.'::text as role_action,
  'role_private'::text as visibility_scope
from public.data_reconciliation_reviews d
join public.cargos c on upper(c.name) = 'JEFE DEPARTAMENTO DE MANTENIMIENTO'
where d.status = 'open'
  and d.issue_key like 'laudus:fixed_asset_identity:%'

union all

select
  r.organization_id,
  c.id as cargo_id,
  c.name as cargo_name,
  'procurement-receipt-backlog'::text as task_key,
  'inventory'::text as domain,
  'warning'::text as severity,
  72 as priority_score,
  'Registrar recepciones de OCs MOTIL'::text as title,
  count(*)::text || ' OC(s) nativas con recepción física pendiente' as evidence_summary,
  'pending'::text as status,
  true as material_related,
  min(r.order_date)::timestamptz as occurred_at,
  'receive_native_purchase_orders'::text as recommended_action,
  'owner'::text as responsibility,
  'Abrir Bodega y registrar cantidades realmente recibidas. No usar estado legacy ni factura como evidencia física.'::text as role_action,
  'role_private'::text as visibility_scope
from public.procurement_receipt_coverage_v1 r
join public.cargos c on upper(c.name)='JEFE BODEGA'
where r.human_action_now=true
group by r.organization_id,c.id,c.name

union all

select
  r.organization_id,
  c.id as cargo_id,
  c.name as cargo_name,
  'procurement-receipt-supervision'::text as task_key,
  'inventory'::text as domain,
  'info'::text as severity,
  45 as priority_score,
  'Supervisar recepciones pendientes'::text as title,
  count(*)::text || ' OC(s) MOTIL pendientes de recepción en Bodega' as evidence_summary,
  'pending'::text as status,
  false as material_related,
  min(r.order_date)::timestamptz as occurred_at,
  'supervise_native_purchase_order_receipts'::text as recommended_action,
  'support'::text as responsibility,
  'Supervisar que Bodega registre evidencia física y escalar sólo si una recepción bloquea mantenimiento, factura o pago.'::text as role_action,
  'role_private'::text as visibility_scope
from public.procurement_receipt_coverage_v1 r
join public.cargos c on upper(c.name)='JEFE DE PLANIFICACIÓN'
where r.human_action_now=true
group by r.organization_id,c.id,c.name

union all

select
  r.organization_id,
  c.id as cargo_id,
  c.name as cargo_name,
  'laudus-bank-evidence-gap'::text as task_key,
  'finance'::text as domain,
  'warning'::text as severity,
  68 as priority_score,
  'Conectar evidencia bancaria actual'::text as title,
  concat_ws(
    ' · ',
    r.payment_count::text || ' pagos Laudus',
    r.deposited_count::text || ' marcados depositados',
    'último pago ' || coalesce(to_char(r.max_payment_date,'DD-MM-YYYY'),'sin fecha'),
    'última cartola ' || coalesce(to_char(r.max_statement_to,'DD-MM-YYYY'),'sin evidencia')
  ) as evidence_summary,
  'pending'::text as status,
  false as material_related,
  r.max_payment_date as occurred_at,
  'connect_current_bank_evidence'::text as recommended_action,
  'owner'::text as responsibility,
  'Cargar o conectar cartolas bancarias actuales para conciliar banco contra pagos. No considerar deposited=true como conciliación bancaria.'::text as role_action,
  'role_private'::text as visibility_scope
from public.laudus_bank_reconciliation_readiness_v1 r
join public.cargos c on upper(c.name)='GERENTE DE FINANZAS'
where r.human_action_now=true

union all

select
  d.organization_id,
  c.id as cargo_id,
  c.name as cargo_name,
  'laudus-fixed-asset-support:'::text || split_part(d.issue_key, ':', 3) as task_key,
  'maintenance'::text as domain,
  'info'::text as severity,
  55 as priority_score,
  'Apoyar identidad de activo Laudus'::text as title,
  d.evidence_reference as evidence_summary,
  'pending'::text as status,
  false as material_related,
  d.created_at as occurred_at,
  'support_laudus_fixed_asset_identity'::text as recommended_action,
  'support'::text as responsibility,
  'Como líder del proyecto, revisar evidencia y confirmar, rechazar o diferir cuando corresponda. Mantenimiento conserva ownership operacional.'::text as role_action,
  'role_private'::text as visibility_scope
from public.data_reconciliation_reviews d
join public.cargos c on upper(c.name)='JEFE DE PLANIFICACIÓN'
where d.status='open'
  and d.issue_key like 'laudus:fixed_asset_identity:%';
