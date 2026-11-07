-- Candidatos de recuperacion puntual de facturas Laudus referenciadas por pagos pero ausentes localmente.
-- Prioriza huecos dentro del rango ya cargado y luego recupera historia anterior sin descartarla.

create or replace view public.laudus_missing_purchase_invoice_recovery_candidates_v1 as
with limites as (
  select
    organization_id,
    min((external_id)::bigint) filter (where external_id ~ '^[0-9]+$') as min_external_id_local,
    max((external_id)::bigint) filter (where external_id ~ '^[0-9]+$') as max_external_id_local
  from integration.laudus_purchase_invoices
  group by organization_id
),
faltantes as (
  select
    a.organization_id,
    a.purchase_invoice_external_id,
    max(a.doc_number) as doc_number,
    max(a.supplier_external_id) as supplier_external_id,
    max(a.supplier_name) as supplier_name,
    max(a.synced_at) as last_reference_synced_at,
    sum(a.applied_amount) as applied_amount
  from integration.laudus_purchase_payment_allocations a
  left join integration.laudus_purchase_invoices i
    on i.organization_id=a.organization_id
   and i.external_id=a.purchase_invoice_external_id
  where i.id is null
    and a.purchase_invoice_external_id is not null
  group by a.organization_id,a.purchase_invoice_external_id
)
select
  f.organization_id,
  f.purchase_invoice_external_id,
  case
    when f.purchase_invoice_external_id ~ '^[0-9]+$'
     and l.min_external_id_local is not null
     and (f.purchase_invoice_external_id)::bigint between l.min_external_id_local and l.max_external_id_local
      then 'faltante_dentro_rango'
    when f.purchase_invoice_external_id ~ '^[0-9]+$'
     and l.min_external_id_local is not null
     and (f.purchase_invoice_external_id)::bigint < l.min_external_id_local
      then 'historia_anterior_backfill'
    else 'referencia_sin_clasificar'
  end as recovery_class,
  f.doc_number,
  f.supplier_external_id,
  f.supplier_name,
  f.applied_amount,
  f.last_reference_synced_at,
  case
    when f.purchase_invoice_external_id ~ '^[0-9]+$'
     and l.min_external_id_local is not null
     and (f.purchase_invoice_external_id)::bigint between l.min_external_id_local and l.max_external_id_local
      then 1
    when f.purchase_invoice_external_id ~ '^[0-9]+$'
     and l.min_external_id_local is not null
     and (f.purchase_invoice_external_id)::bigint < l.min_external_id_local
      then 2
    else 3
  end as recovery_priority
from faltantes f
left join limites l using (organization_id);

grant select on public.laudus_missing_purchase_invoice_recovery_candidates_v1 to authenticated,service_role;
