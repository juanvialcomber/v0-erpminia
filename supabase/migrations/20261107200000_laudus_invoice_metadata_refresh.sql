-- Refresca sólo metadatos de cabecera de facturas Laudus ya existentes.
-- Preserva líneas, trazas y evidencia detallada; no crea facturas ni toca canónico.

create or replace function public.motil_refresh_laudus_purchase_invoice_metadata(
  p_organization_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,integration,pg_temp
as $$
declare
  v_row jsonb;
  v_external_id text;
  v_updated integer := 0;
  v_supplier_id text;
  v_supplier_name text;
  v_supplier_tax_id text;
  v_doc_number text;
  v_total numeric;
  v_due_date timestamptz;
  v_issued_date timestamptz;
  v_warehouse_id text;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;
  if jsonb_array_length(p_rows) > 250 then
    raise exception 'batch too large';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_external_id := nullif(trim(coalesce(v_row->>'purchaseInvoiceId',v_row->>'invoiceId')),'');
    if v_external_id is null then continue; end if;

    v_supplier_id := nullif(trim(coalesce(v_row#>>'{supplier,supplierId}',v_row->>'supplierId')),'');
    v_supplier_name := nullif(trim(coalesce(v_row#>>'{supplier,legalName}',v_row#>>'{supplier,name}',v_row->>'supplierName')),'');
    v_supplier_tax_id := nullif(trim(coalesce(v_row#>>'{supplier,VATId}',v_row#>>'{supplier,vatId}',v_row->>'supplierVATId')),'');
    v_doc_number := nullif(trim(v_row->>'docNumber'),'');
    v_issued_date := case when nullif(v_row->>'issuedDate','') is not null then (v_row->>'issuedDate')::timestamptz else null end;
    v_due_date := case when nullif(v_row->>'dueDate','') is not null then (v_row->>'dueDate')::timestamptz else null end;
    v_warehouse_id := nullif(trim(coalesce(v_row#>>'{warehouse,warehouseId}',v_row->>'warehouseId')),'');
    v_total := case
      when nullif(coalesce(v_row#>>'{totals,total}',v_row->>'totalAmount'),'') is not null
      then coalesce(v_row#>>'{totals,total}',v_row->>'totalAmount')::numeric
      else null
    end;

    update integration.laudus_purchase_invoices pi
    set
      supplier_external_id=coalesce(v_supplier_id,pi.supplier_external_id),
      supplier_name=coalesce(v_supplier_name,pi.supplier_name),
      supplier_tax_id=coalesce(v_supplier_tax_id,pi.supplier_tax_id),
      doc_number=coalesce(v_doc_number,pi.doc_number),
      issued_date=coalesce(v_issued_date,pi.issued_date),
      due_date=coalesce(v_due_date,pi.due_date),
      warehouse_external_id=coalesce(v_warehouse_id,pi.warehouse_external_id),
      total_amount=coalesce(v_total,pi.total_amount),
      source_payload=coalesce(pi.source_payload,'{}'::jsonb) || v_row,
      payload_hash=md5((coalesce(pi.source_payload,'{}'::jsonb) || v_row)::text),
      synced_at=now()
    where pi.organization_id=p_organization_id
      and pi.external_id=v_external_id;

    if found then v_updated := v_updated + 1; end if;
  end loop;

  return jsonb_build_object(
    'updated',v_updated,
    'canonical_mutated',false,
    'laudus_mutated',false,
    'invoice_lines_preserved',true
  );
end;
$$;

revoke all on function public.motil_refresh_laudus_purchase_invoice_metadata(uuid,jsonb)
from public,anon,authenticated;

grant execute on function public.motil_refresh_laudus_purchase_invoice_metadata(uuid,jsonb)
to service_role;

comment on function public.motil_refresh_laudus_purchase_invoice_metadata(uuid,jsonb)
is 'Refresca cabecera de facturas Laudus existentes sin borrar líneas ni trazas.';
