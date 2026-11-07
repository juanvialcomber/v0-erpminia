-- Corrige total_amount de facturas Laudus usando el valor fuente ya preservado en source_payload.
-- Es staging-only: no modifica Laudus ni datos canonicos MOTIL.

create or replace function integration.motil_normalize_laudus_invoice_total_from_payload()
returns trigger
language plpgsql
security definer
set search_path=integration,public,pg_temp
as $$
declare
  v_total_text text;
begin
  if new.total_amount is not null then
    return new;
  end if;

  v_total_text := nullif(btrim(new.source_payload->>'totals_total'),'');
  if v_total_text is not null
     and v_total_text ~ '^-?[0-9]+([.][0-9]+)?$' then
    new.total_amount := v_total_text::numeric;
  end if;

  return new;
end;
$$;

revoke all on function integration.motil_normalize_laudus_invoice_total_from_payload() from public,anon,authenticated;

drop trigger if exists trg_laudus_purchase_invoice_total_from_payload
  on integration.laudus_purchase_invoices;

create trigger trg_laudus_purchase_invoice_total_from_payload
before insert or update of source_payload,total_amount
on integration.laudus_purchase_invoices
for each row
execute function integration.motil_normalize_laudus_invoice_total_from_payload();

-- Repara sólo filas donde el monto fuente está presente y es inequívocamente numérico.
update integration.laudus_purchase_invoices
set
  total_amount=(source_payload->>'totals_total')::numeric,
  synced_at=greatest(synced_at,now())
where total_amount is null
  and nullif(btrim(source_payload->>'totals_total'),'') is not null
  and (source_payload->>'totals_total') ~ '^-?[0-9]+([.][0-9]+)?$';

comment on function integration.motil_normalize_laudus_invoice_total_from_payload()
is 'Normaliza total_amount desde source_payload.totals_total cuando el dato fuente Laudus ya fue preservado localmente.';
