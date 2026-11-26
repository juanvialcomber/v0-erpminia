-- Operational voucher workflow. No seeds, opening balances or stock changes on installation.
create table public.warehouse_voucher_settings (
 organization_id uuid primary key references public.organizations(id),
 enabled boolean not null default false,
 deliveries_enabled boolean not null default false,
 weekend_authorizations boolean not null default false
);
create table public.warehouse_voucher_access (
 organization_id uuid not null references public.organizations(id),
 profile_id uuid not null references public.profiles(id),
 can_request boolean not null default false,
 can_approve boolean not null default false,
 can_deliver boolean not null default false,
 expires_at timestamptz not null,
 source_reference text not null,
 primary key(organization_id,profile_id)
);
-- Explicit activation is separate from count approval; never seeded by this migration.
create table public.warehouse_voucher_stock_activation (
 stock_id uuid primary key references public.warehouse_stock(id),
 count_id uuid not null references public.bodega_motil_stock_counts_v1(id),
 activated_by uuid not null references public.profiles(id),
 activated_at timestamptz not null default now()
);
create table public.warehouse_consumption_vouchers (
 id uuid primary key default gen_random_uuid(),
 folio bigint generated always as identity unique,
 organization_id uuid not null references public.organizations(id),
 warehouse_id uuid not null references public.warehouses(id),
 work_order_id uuid not null references public.maintenance_work_orders(id),
 requested_by uuid not null references public.profiles(id),
 receiver_id uuid not null references public.profiles(id),
 reason text not null check(length(reason) between 3 and 500),
 status text not null default 'pending' check(status in ('pending','approved','rejected','delivered','cancelled')),
 qr_reference uuid not null unique default gen_random_uuid(),
 expires_at timestamptz not null default now()+interval '7 days',
 created_at timestamptz not null default now(),
 decided_by uuid references public.profiles(id),
 decided_at timestamptz,
 decision_reason text,
 request_id uuid not null,
 request_payload jsonb not null,
 unique(organization_id,requested_by,request_id)
);
create table public.warehouse_consumption_voucher_lines (
 id uuid primary key default gen_random_uuid(),
 voucher_id uuid not null references public.warehouse_consumption_vouchers(id),
 canonical_product_id uuid not null references canonical.products(id),
 product_code text not null,
 product_name text not null,
 unit text not null,
 quantity numeric(18,6) not null check(quantity>0),
 delivered numeric(18,6) not null default 0 check(delivered>=0 and delivered<=quantity),
 unique(voucher_id,canonical_product_id)
);
create table public.warehouse_consumption_voucher_events (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 voucher_id uuid not null references public.warehouse_consumption_vouchers(id),
 actor_id uuid not null references public.profiles(id),
 action text not null,
 request_id uuid not null,
 payload jsonb not null,
 stock_movement_id uuid references public.stock_movements(id),
 created_at timestamptz not null default now(),
 unique(organization_id,actor_id,request_id)
);
create index warehouse_vouchers_org_created on public.warehouse_consumption_vouchers(organization_id,created_at desc);
-- All access goes through authenticated server context and service-only RPCs.
do $$ declare t text; begin
 foreach t in array array['warehouse_voucher_stock_activation','warehouse_voucher_settings','warehouse_voucher_access','warehouse_consumption_vouchers','warehouse_consumption_voucher_lines','warehouse_consumption_voucher_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to service_role',t);
 end loop;
end $$;

create function public.warehouse_voucher_command_v1(p_org uuid,p_actor uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,canonical as $$
declare a public.warehouse_voucher_access; v public.warehouse_consumption_vouchers;
 cfg public.warehouse_voucher_settings; line jsonb; prod canonical.products;
 ln public.warehouse_consumption_voucher_lines; st public.warehouse_stock;
 previous public.warehouse_consumption_voucher_events; q numeric; rid uuid;
 receiver uuid; auth_actor uuid; result jsonb; ids uuid[]; stock_id uuid; movement_id uuid;
begin
 select * into cfg from public.warehouse_voucher_settings where organization_id=p_org for share;
 if cfg.enabled is distinct from true then raise exception 'pilot_disabled'; end if;
 select * into a from public.warehouse_voucher_access where organization_id=p_org and profile_id=p_actor and expires_at>now() for share;
 if a.profile_id is null or not exists(select 1 from public.profiles where id=p_actor and organization_id=p_org and status='active') then raise exception 'not_authorized'; end if;
 rid := (p_payload->>'requestId')::uuid;
 if rid is null then raise exception 'request_id_required'; end if;
 if p_action='create' then
  if not a.can_request then raise exception 'not_authorized'; end if;
  -- Serialize duplicate creates before checking the idempotency receipt.
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_actor::text||rid::text,0));
  select * into v from public.warehouse_consumption_vouchers where organization_id=p_org and requested_by=p_actor and request_id=rid;
  if found then
   if v.request_payload<>p_payload then raise exception 'idempotency_conflict'; end if;
   return to_jsonb(v);
  end if;
  if not exists(select 1 from public.warehouses where id=(p_payload->>'warehouseId')::uuid and organization_id=p_org and code='002') then raise exception 'invalid_warehouse'; end if;
  if not exists(select 1 from public.maintenance_work_orders where id=(p_payload->>'workOrderId')::uuid and organization_id=p_org and created_by is not null and status not in ('completed','cancelled','closed')) then raise exception 'invalid_work_order'; end if;
  receiver := (p_payload->>'receiverId')::uuid;
  if not exists(select 1 from public.profiles where id=receiver and organization_id=p_org and status='active') then raise exception 'invalid_receiver'; end if;
  if jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines') not between 1 and 15 then raise exception 'invalid_lines'; end if;
  insert into public.warehouse_consumption_vouchers(organization_id,warehouse_id,work_order_id,requested_by,receiver_id,reason,request_id,request_payload)
  values(p_org,(p_payload->>'warehouseId')::uuid,(p_payload->>'workOrderId')::uuid,p_actor,receiver,btrim(p_payload->>'reason'),rid,p_payload) returning * into v;
  for line in select * from jsonb_array_elements(p_payload->'lines') loop
   if coalesce(line->>'quantity','') !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' then raise exception 'invalid_quantity'; end if;
   q := (line->>'quantity')::numeric;
   if q<=0 then raise exception 'invalid_quantity'; end if;
   select * into prod from canonical.products where id=(line->>'productId')::uuid and organization_id=p_org and is_active and validation_status='valid' and nullif(btrim(unit),'') is not null;
   if not found then raise exception 'invalid_product'; end if;
   insert into public.warehouse_consumption_voucher_lines(voucher_id,canonical_product_id,product_code,product_name,unit,quantity)
    values(v.id,prod.id,prod.product_code,prod.name,prod.unit,q);
  end loop;
 else
  select * into v from public.warehouse_consumption_vouchers where organization_id=p_org and id=(p_payload->>'voucherId')::uuid for update;
  if not found then raise exception 'voucher_not_found'; end if;
  -- QR grants no permission. Capability and actor are always checked again.
  if p_action in ('approve','reject') and (not a.can_approve or v.requested_by=p_actor) then raise exception 'not_authorized'; end if;
  if p_action='deliver' and (not a.can_deliver or v.requested_by=p_actor) then raise exception 'not_authorized'; end if;
  if p_action='cancel' and v.requested_by<>p_actor and not a.can_approve then raise exception 'not_authorized'; end if;
  if p_action not in ('approve','reject','deliver','cancel') then raise exception 'invalid_action'; end if;
  select * into previous from public.warehouse_consumption_voucher_events where organization_id=p_org and actor_id=p_actor and request_id=rid;
  if found then
   if previous.voucher_id<>v.id or previous.action<>p_action or previous.payload<>p_payload then raise exception 'idempotency_conflict'; end if;
   return to_jsonb(v);
  end if;
  if p_action='cancel' then
   if v.status not in ('pending','approved') or exists(select 1 from public.warehouse_consumption_voucher_lines where voucher_id=v.id and delivered>0) then raise exception 'invalid_state'; end if;
   update public.warehouse_consumption_vouchers set status='cancelled' where id=v.id returning * into v;
  else
   if v.expires_at<=now() then raise exception 'voucher_expired'; end if;
   if extract(isodow from now() at time zone 'America/Santiago') in (6,7) and not cfg.weekend_authorizations then raise exception 'weekend_policy_pending'; end if;
   if p_action in ('approve','reject') then
    if v.status<>'pending' then raise exception 'invalid_state'; end if;
    if length(btrim(coalesce(p_payload->>'reason',''))) not between 3 and 500 then raise exception 'reason_required'; end if;
    update public.warehouse_consumption_vouchers set status=case when p_action='approve' then 'approved' else 'rejected' end,decided_by=p_actor,decided_at=now(),decision_reason=btrim(p_payload->>'reason') where id=v.id returning * into v;
   else
    if not cfg.deliveries_enabled then raise exception 'delivery_activation_pending'; end if;
    if not exists(select 1 from public.maintenance_work_orders where id=v.work_order_id and organization_id=p_org and created_by is not null and status not in ('completed','cancelled','closed')) then raise exception 'invalid_work_order'; end if;
    if v.status<>'approved' or v.qr_reference::text is distinct from p_payload->>'qrReference' then raise exception 'invalid_qr_or_state'; end if;
    if (p_payload->>'physicalConfirmed') is distinct from 'true' or (p_payload->>'receiverId') is distinct from v.receiver_id::text then raise exception 'physical_confirmation_required'; end if;
    if not exists(select 1 from public.profiles where id=v.receiver_id and organization_id=p_org and status='active') then raise exception 'invalid_receiver'; end if;
    select * into ln from public.warehouse_consumption_voucher_lines where voucher_id=v.id and id=(p_payload->>'lineId')::uuid for update;
    if not found then raise exception 'line_not_found'; end if;
    if coalesce(p_payload->>'quantity','') !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' then raise exception 'invalid_quantity'; end if;
    q := (p_payload->>'quantity')::numeric;
    if q<=0 or q>ln.quantity-ln.delivered then raise exception 'exceeds_voucher'; end if;
    -- Current canonical stock/movements are integers. Reject fractions, NEVER round.
    -- Reuse the decimal fulfillment migration when it is separately verified.
    if q<>trunc(q) then raise exception 'decimal_stock_contract_pending'; end if;
    if not exists(select 1 from canonical.products where id=ln.canonical_product_id and organization_id=p_org and is_active and validation_status='valid' and unit=ln.unit) then raise exception 'invalid_product'; end if;
    select array_agg(id) into ids from public.warehouse_stock where organization_id=p_org and warehouse_id=v.warehouse_id and canonical_product_id=ln.canonical_product_id;
    if coalesce(cardinality(ids),0)<>1 then raise exception 'ambiguous_stock'; end if;
    stock_id := ids[1];
    select * into st from public.warehouse_stock where id=stock_id and organization_id=p_org for update;
    if st.quantity_on_hand is null or st.quantity_reserved is null or st.quantity_reserved<0 or st.quantity_on_hand-st.quantity_reserved<q then raise exception 'insufficient_available'; end if;
    if not exists(select 1 from public.warehouse_voucher_stock_activation activation join public.bodega_motil_stock_counts_v1 c on c.id=activation.count_id join public.bodega_motil_stock_count_reviews_v1 r on r.count_id=c.id where activation.stock_id=st.id and c.organization_id=p_org and c.warehouse_id=v.warehouse_id and c.canonical_product_id=ln.canonical_product_id and r.decision='approved_for_opening') then raise exception 'opening_pending'; end if;
    select l.auth_user_id into auth_actor from public.auth_profile_identity_links l where l.profile_id=p_actor limit 1;
    if auth_actor is null and exists(select 1 from auth.users where id=p_actor) then auth_actor:=p_actor; end if;
    update public.warehouse_stock set quantity_on_hand=quantity_on_hand-q,updated_at=now() where id=st.id;
    insert into public.stock_movements(organization_id,stock_id,movement_type,quantity,reference_doc,reference_id,performed_by,reason,work_order_id,canonical_product_id)
     values(p_org,st.id,'issue',q,'warehouse_consumption_voucher',v.id,auth_actor,v.reason,v.work_order_id,ln.canonical_product_id) returning id into movement_id;
    update public.warehouse_consumption_voucher_lines set delivered=delivered+q where id=ln.id;
    if not exists(select 1 from public.warehouse_consumption_voucher_lines where voucher_id=v.id and delivered<quantity) then
     update public.warehouse_consumption_vouchers set status='delivered' where id=v.id returning * into v;
    end if;
   end if;
  end if;
 end if;
 insert into public.warehouse_consumption_voucher_events(organization_id,voucher_id,actor_id,action,request_id,payload,stock_movement_id)
 values(p_org,v.id,p_actor,p_action,rid,p_payload,movement_id);
 result := to_jsonb(v);
 return result;
end $$;
revoke all on function public.warehouse_voucher_command_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.warehouse_voucher_command_v1(uuid,uuid,text,jsonb) to service_role;
