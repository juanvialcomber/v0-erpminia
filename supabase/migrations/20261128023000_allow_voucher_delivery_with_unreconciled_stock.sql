-- Let Bodega record confirmed physical voucher delivery while inventory
-- reconciliation is pending, but require an explicit warning acknowledgment.
-- The existing available-balance check, row lock, physical confirmation, and
-- movement ledger remain in force. This does not invent or open stock.
DO $migration$
DECLARE
  current_definition text;
  patched_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.warehouse_voucher_command_v1(uuid,uuid,text,jsonb)'::regprocedure
  ) INTO current_definition;

  IF position('opening_pending' in current_definition) = 0 THEN
    RAISE EXCEPTION 'expected opening reconciliation gate was not found';
  END IF;

  patched_definition := replace(
    current_definition,
    'raise exception ''opening_pending'';',
    'if coalesce(p_payload->>''unreconciledStockConfirmed'',''false'') <> ''true'' then raise exception ''stock_reconciliation_ack_required''; end if;'
  );
  IF patched_definition = current_definition
     OR position('opening_pending' in patched_definition) > 0
     OR position('stock_reconciliation_ack_required' in patched_definition) = 0 THEN
    RAISE EXCEPTION 'could not replace opening gate with explicit warning acknowledgment';
  END IF;

  EXECUTE patched_definition;
END
$migration$;
