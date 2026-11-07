-- Cierra revisiones de OC que quedaron obsoletas despues de mejorar la conciliacion por linea.
-- No borra evidencia; cambia a resuelto solo cuando la vista actual determina que la OC ya es resoluble.

update public.data_reconciliation_reviews r
set
  status='resolved',
  resolution_note=coalesce(r.resolution_note,'') ||
    case when coalesce(r.resolution_note,'')='' then '' else ' | ' end ||
    'Resuelta automaticamente por conciliacion vigente de proveedor/centro de costo MOTIL.',
  reviewed_at=coalesce(r.reviewed_at,now()),
  updated_at=now()
from public.purchase_order_reconciliation_preview_service_v1 p
where r.organization_id=p.organization_id
  and r.entity_type='purchase_order'
  and r.entity_id=p.purchase_order_id
  and r.issue_key like 'laudus:purchase_order_unresolved:%'
  and r.status='open'
  and p.fully_resolvable=true;

-- Mantiene abierta solo la OC verdaderamente ambigua sin centro en toda la cadena de compra.
update public.data_reconciliation_reviews r
set
  issue_type='centro_costo_ausente_cadena_compra',
  field_name='centro_costo',
  updated_at=now()
where r.issue_key='motil:oc_sin_centro_costo:d57e56f5-4669-4910-b7d6-028c9b21908d'
  and r.status='open';
