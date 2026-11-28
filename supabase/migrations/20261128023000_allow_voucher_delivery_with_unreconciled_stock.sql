-- Record physical voucher delivery even when the stock position is not
-- reconciled, while leaving canonical balances unchanged until reconciliation.
CREATE TABLE public.warehouse_voucher_stock_reconciliation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  voucher_id uuid NOT NULL REFERENCES public.warehouse_consumption_vouchers(id),
  voucher_line_id uuid NOT NULL REFERENCES public.warehouse_consumption_voucher_lines(id),
  stock_id uuid REFERENCES public.warehouse_stock(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  canonical_product_id uuid NOT NULL REFERENCES canonical.products(id),
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  source_reconciliation_state text NOT NULL,
  reconciliation_reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved')),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES public.profiles(id),
  resolved_at timestamptz,
  resolution_reference text,
  UNIQUE (organization_id, request_id)
);
CREATE INDEX warehouse_voucher_stock_reconciliation_pending
  ON public.warehouse_voucher_stock_reconciliation_queue(organization_id, created_at DESC)
  WHERE status = 'pending';
ALTER TABLE public.warehouse_voucher_stock_reconciliation_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.warehouse_voucher_stock_reconciliation_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.warehouse_voucher_stock_reconciliation_queue TO service_role;

-- Preserve the deployed RPC and replace only the canonical stock handling block.
-- A verified and warehouse-linked position follows the normal stock movement.
-- Otherwise, physical delivery is recorded in a reconciliation queue and the
-- untrusted canonical balance is not changed. The UI acknowledgment is enforced
-- again in the database function.
DO $migration$
DECLARE
  current_definition text;
  patched_definition text;
  start_pos integer;
  end_pos integer;
  end_anchor text := ' returning id into movement_id;';
  replacement text := $replacement$
    select array_agg(id) into ids
      from public.warehouse_stock
      where organization_id=p_org and warehouse_id=v.warehouse_id and canonical_product_id=ln.canonical_product_id;
    stock_id := null;
    if coalesce(cardinality(ids),0)=1 then
      stock_id := ids[1];
      select * into st from public.warehouse_stock where id=stock_id and organization_id=p_org for update;
    end if;
    select coalesce(max(reconciliation_state),'missing_source')
      into source_state
      from public.bodega_inventory_operational_service_v1
      where organization_id=p_org and canonical_product_id=ln.canonical_product_id;
    is_stock_reconciled := stock_id is not null
      and source_state='aligned'
      and exists(
        select 1
        from public.warehouse_voucher_stock_activation activation
        join public.bodega_motil_stock_counts_v1 c on c.id=activation.count_id
        join public.bodega_motil_stock_count_reviews_v1 r on r.count_id=c.id
        where activation.stock_id=stock_id
          and c.organization_id=p_org
          and c.warehouse_id=v.warehouse_id
          and c.canonical_product_id=ln.canonical_product_id
          and r.decision='approved_for_opening'
      );
    if not is_stock_reconciled then
      if stock_id is null then
        reconciliation_reason := 'missing_or_ambiguous_warehouse_position';
      elsif source_state <> 'aligned' then
        reconciliation_reason := 'laudus_motil_stock_mismatch';
      else
        reconciliation_reason := 'physical_count_not_approved';
      end if;
    end if;
    if is_stock_reconciled then
      if st.quantity_on_hand is null or st.quantity_reserved is null or st.quantity_reserved<0 or st.quantity_on_hand-st.quantity_reserved<q then
        raise exception 'insufficient_available';
      end if;
      select l.auth_user_id into auth_actor from public.auth_profile_identity_links l where l.profile_id=p_actor limit 1;
      if auth_actor is null and exists(select 1 from auth.users where id=p_actor) then auth_actor:=p_actor; end if;
      update public.warehouse_stock set quantity_on_hand=quantity_on_hand-q,updated_at=now() where id=st.id;
      insert into public.stock_movements(organization_id,stock_id,movement_type,quantity,reference_doc,reference_id,performed_by,reason,work_order_id,canonical_product_id)
       values(p_org,st.id,'issue',q,'warehouse_consumption_voucher',v.id,auth_actor,v.reason,v.work_order_id,ln.canonical_product_id)$replacement$ || end_anchor || $replacement$
    else
      if coalesce(p_payload->>'unreconciledStockConfirmed','false') <> 'true' then
        raise exception 'stock_reconciliation_ack_required';
      end if;
      insert into public.warehouse_voucher_stock_reconciliation_queue(
        organization_id,voucher_id,voucher_line_id,stock_id,warehouse_id,
        canonical_product_id,quantity,unit,source_reconciliation_state,
        reconciliation_reason,created_by,request_id
      ) values (
        p_org,v.id,ln.id,stock_id,v.warehouse_id,ln.canonical_product_id,
        q,ln.unit,source_state,reconciliation_reason,p_actor,rid
      );
      movement_id := null;
    end if;
$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.warehouse_voucher_command_v1(uuid,uuid,text,jsonb)'::regprocedure
  ) INTO current_definition;

  IF position('select array_agg(id) into ids from public.warehouse_stock' in current_definition)=0
     OR position(end_anchor in current_definition)=0
     OR position('opening_pending' in current_definition)=0 THEN
    RAISE EXCEPTION 'expected warehouse voucher stock block not found; review deployed RPC';
  END IF;
  IF length(current_definition)-length(replace(current_definition,'select array_agg(id) into ids from public.warehouse_stock',''))=0
     OR length(current_definition)-length(replace(current_definition,end_anchor,''))<>length(end_anchor) THEN
    RAISE EXCEPTION 'expected exactly one stock handling block and movement insert';
  END IF;

  patched_definition := replace(
    current_definition,
    'stock_id uuid; movement_id uuid;',
    'stock_id uuid; movement_id uuid; is_stock_reconciled boolean; source_state text; reconciliation_reason text;'
  );
  IF patched_definition=current_definition THEN
    RAISE EXCEPTION 'could not extend deployed RPC declarations';
  END IF;
  start_pos := position('select array_agg(id) into ids from public.warehouse_stock' in patched_definition);
  end_pos := position(end_anchor in patched_definition);
  patched_definition := substr(patched_definition,1,start_pos-1)
    || replacement
    || substr(patched_definition,end_pos+length(end_anchor));

  IF position('opening_pending' in patched_definition)>0
     OR position('stock_reconciliation_ack_required' in patched_definition)=0
     OR position('warehouse_voucher_stock_reconciliation_queue' in patched_definition)=0 THEN
    RAISE EXCEPTION 'stock handling replacement failed validation';
  END IF;
  EXECUTE patched_definition;
END
$migration$;
