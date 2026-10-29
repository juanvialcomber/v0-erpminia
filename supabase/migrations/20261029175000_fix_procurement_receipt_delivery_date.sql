-- Keep procurement delivery dates aligned with real receipt evidence.
-- Future full receipts set actual_delivery_date. Historical received/closed orders
-- are reconciled deterministically from the first recorded receipt date.

create or replace function public.receive_operational_order(
  p_order_id uuid,
  p_lines jsonb,
  p_notes text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'canonical', 'auth', 'pg_temp'
as $function$
declare
  v_order public.procurement_operational_orders%rowtype;
  v_receipt_id uuid;
  v_receipt_number text;
  v_line jsonb;
  v_ol public.procurement_operational_order_lines%rowtype;
  v_qty numeric;
  v_accepted numeric;
  v_rejected numeric;
  v_stock_id uuid;
  v_old_qty numeric;
  v_old_cost numeric;
  v_new_cost numeric;
  v_application_actor uuid := public.current_application_user_id();
  v_auth_actor uuid;
  v_fully_received boolean;
begin
  select * into v_order
  from public.procurement_operational_orders
  where id = p_order_id
  for update;

  if not found then raise exception 'OC operativa no encontrada'; end if;
  if v_order.organization_id not in (
    select organization_id from public.user_roles where user_id = v_application_actor
  ) then raise exception 'Sin permisos'; end if;
  if v_order.status not in ('issued','partially_received') then raise exception 'OC no recepcionable'; end if;

  select l.auth_user_id into v_auth_actor
  from public.auth_profile_identity_links l
  where l.profile_id = v_application_actor;

  if v_auth_actor is null and exists(select 1 from auth.users u where u.id=v_application_actor) then
    v_auth_actor := v_application_actor;
  end if;

  v_receipt_number := 'REC-' || to_char(current_date,'YYYY') || '-' ||
    lpad((coalesce((
      select count(*) + 1
      from public.procurement_operational_receipts
      where organization_id = v_order.organization_id
    ),1))::text,5,'0');

  insert into public.procurement_operational_receipts(
    organization_id, receipt_number, order_id, received_by, notes
  )
  values(
    v_order.organization_id, v_receipt_number, v_order.id, v_application_actor, p_notes
  )
  returning id into v_receipt_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_ol
    from public.procurement_operational_order_lines
    where id = (v_line->>'order_line_id')::uuid
      and order_id = v_order.id
    for update;

    if not found then raise exception 'Línea de OC inválida'; end if;

    v_qty := (v_line->>'quantity_received')::numeric;
    v_accepted := coalesce((v_line->>'quantity_accepted')::numeric, v_qty);
    v_rejected := coalesce((v_line->>'quantity_rejected')::numeric, 0);

    if v_qty <= 0 or v_accepted + v_rejected <> v_qty then
      raise exception 'Cantidades de recepción inválidas';
    end if;

    if v_ol.quantity_received + v_qty > v_ol.quantity_ordered then
      raise exception 'Recepción excede cantidad ordenada';
    end if;

    insert into public.procurement_operational_receipt_lines(
      organization_id, receipt_id, order_line_id, canonical_product_id,
      quantity_received, quantity_accepted, quantity_rejected, unit_cost,
      batch_number, expiry_date
    )
    values(
      v_order.organization_id, v_receipt_id, v_ol.id, v_ol.canonical_product_id,
      v_qty, v_accepted, v_rejected, v_ol.unit_cost,
      v_line->>'batch_number', nullif(v_line->>'expiry_date','')::date
    );

    update public.procurement_operational_order_lines
    set quantity_received = quantity_received + v_qty
    where id = v_ol.id;

    if v_accepted > 0 then
      select id, quantity_on_hand, unit_cost
      into v_stock_id, v_old_qty, v_old_cost
      from public.warehouse_stock
      where organization_id = v_order.organization_id
        and canonical_product_id = v_ol.canonical_product_id
      order by created_at
      limit 1
      for update;

      if v_stock_id is null then
        insert into public.warehouse_stock(
          organization_id, part_code, part_name, quantity_on_hand, quantity_reserved,
          reorder_level, reorder_quantity, unit_cost, canonical_product_id,
          created_at, updated_at
        )
        select
          v_order.organization_id, p.product_code, p.name, v_accepted::integer, 0,
          coalesce(p.minimum_stock,0)::integer, 0, v_ol.unit_cost, p.id, now(), now()
        from canonical.products p
        where p.id = v_ol.canonical_product_id
        returning id into v_stock_id;
      else
        v_new_cost := case
          when coalesce(v_old_qty,0) + v_accepted = 0 then v_ol.unit_cost
          else (
            (coalesce(v_old_qty,0) * coalesce(v_old_cost,0)) +
            (v_accepted * v_ol.unit_cost)
          ) / (coalesce(v_old_qty,0) + v_accepted)
        end;

        update public.warehouse_stock
        set quantity_on_hand = quantity_on_hand + v_accepted::integer,
            unit_cost = v_new_cost,
            updated_at = now()
        where id = v_stock_id;
      end if;

      insert into public.stock_movements(
        organization_id, stock_id, movement_type, quantity, reference_doc,
        reference_id, performed_by, reason, notes, work_order_id,
        canonical_asset_id, canonical_product_id, unit_cost, total_cost, created_at
      )
      values(
        v_order.organization_id, v_stock_id, 'receipt', v_accepted::integer,
        'operational_receipt', v_receipt_id, v_auth_actor,
        'Recepción de OC operativa', p_notes, v_order.work_order_id,
        v_order.canonical_asset_id, v_ol.canonical_product_id, v_ol.unit_cost,
        v_accepted * v_ol.unit_cost, now()
      );
    end if;
  end loop;

  select not exists(
    select 1
    from public.procurement_operational_order_lines l
    where l.order_id = v_order.id
      and l.quantity_received < l.quantity_ordered
  ) into v_fully_received;

  update public.procurement_operational_orders o
  set status = case when v_fully_received then 'received' else 'partially_received' end,
      actual_delivery_date = case
        when v_fully_received then coalesce(
          o.actual_delivery_date,
          (select min(r.received_at)::date
           from public.procurement_operational_receipts r
           where r.organization_id = o.organization_id
             and r.order_id = o.id),
          current_date
        )
        else o.actual_delivery_date
      end,
      updated_at = now()
  where o.id = v_order.id;

  update public.procurement_intake_requests r
  set status = case when v_fully_received then 'received' else 'partially_received' end,
      updated_at = now()
  where r.id = v_order.intake_request_id;

  if v_order.work_order_id is not null then
    perform public.recalculate_work_order_material_coverage(
      v_order.work_order_id,
      v_application_actor
    );

    insert into public.work_order_events(
      organization_id, work_order_id, canonical_asset_id, event_type,
      actor_id, source_table, source_record_id, summary, payload
    )
    values(
      v_order.organization_id, v_order.work_order_id, v_order.canonical_asset_id,
      'purchase_received', v_application_actor,
      'procurement_operational_receipts', v_receipt_id::text,
      'Materiales recibidos para la OT',
      jsonb_build_object(
        'receipt_id', v_receipt_id,
        'receipt_number', v_receipt_number
      )
    );
  end if;

  return v_receipt_id;
end
$function$;

-- Deterministic historical repair: only orders already marked received/closed,
-- with no delivery date, and with real receipt evidence.
update public.procurement_operational_orders o
set actual_delivery_date = receipt.first_receipt_date,
    updated_at = now()
from (
  select organization_id, order_id, min(received_at)::date as first_receipt_date
  from public.procurement_operational_receipts
  group by organization_id, order_id
) receipt
where o.organization_id = receipt.organization_id
  and o.id = receipt.order_id
  and o.actual_delivery_date is null
  and o.status in ('received','closed')
  and receipt.first_receipt_date is not null;
