import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { voucherInput } from '../lib/bodega/voucher-input.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [org,requester,approver,receiver,warehouse,ot,product,stock,count]=[1,2,3,4,5,6,7,8,9].map(id);
const migration=readFileSync(new URL('../supabase/migrations/20261126143303_warehouse_consumption_vouchers.sql',import.meta.url),'utf8');
const reconciliationMigration=readFileSync(new URL('../supabase/migrations/20261128023000_allow_voucher_delivery_with_unreconciled_stock.sql',import.meta.url),'utf8');
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema canonical;create schema auth;create table auth.users(id uuid primary key);create table public.auth_profile_identity_links(profile_id uuid,auth_user_id uuid);
 create table organizations(id uuid primary key);
 create table profiles(id uuid primary key,organization_id uuid,status text);
 create table warehouses(id uuid primary key,organization_id uuid,code text);
 create table maintenance_work_orders(id uuid primary key,organization_id uuid,created_by uuid,status text);
 create table canonical.products(id uuid primary key,organization_id uuid,product_code text,name text,unit text,is_active boolean,validation_status text);
 create table warehouse_stock(id uuid primary key,organization_id uuid,warehouse_id uuid,canonical_product_id uuid,quantity_on_hand integer,quantity_reserved integer,updated_at timestamptz);
 create table stock_movements(id uuid primary key default gen_random_uuid(),organization_id uuid,stock_id uuid,movement_type text,quantity integer,reference_doc text,reference_id uuid,performed_by uuid references auth.users(id),reason text,work_order_id uuid,canonical_product_id uuid);
 create table bodega_motil_stock_counts_v1(id uuid primary key,organization_id uuid,warehouse_id uuid,canonical_product_id uuid);
 create table bodega_motil_stock_count_reviews_v1(count_id uuid,decision text);
 create table bodega_inventory_operational_service_v1(organization_id uuid,canonical_product_id uuid,reconciliation_state text);
 insert into organizations values('${org}');insert into auth.users values('${id(30)}');insert into auth_profile_identity_links values('${approver}','${id(30)}');
 insert into profiles values('${requester}','${org}','active'),('${approver}','${org}','active'),('${receiver}','${org}','active');
 insert into warehouses values('${warehouse}','${org}','002');
 insert into maintenance_work_orders values('${ot}','${org}','${approver}','in_progress');
 insert into canonical.products values('${product}','${org}','TEST','Material QA','Unidad',true,'valid');
 insert into warehouse_stock values('${stock}','${org}','${warehouse}','${product}',2,0,now());
 insert into bodega_motil_stock_counts_v1 values('${count}','${org}','${warehouse}','${product}');
 insert into bodega_motil_stock_count_reviews_v1 values('${count}','approved_for_opening');
 insert into bodega_inventory_operational_service_v1 values('${org}','${product}','aligned');`);
 await db.exec(migration);
 await db.exec(`alter table warehouse_stock alter column quantity_on_hand type numeric using quantity_on_hand::numeric;
 alter table warehouse_stock alter column quantity_reserved type numeric using quantity_reserved::numeric;
 alter table stock_movements alter column quantity type numeric using quantity::numeric;
 do $decimal$ declare f text; patched text; begin
  select pg_get_functiondef('public.warehouse_voucher_command_v1(uuid,uuid,text,jsonb)'::regprocedure) into f;
  patched:=replace(f,'if q<>trunc(q) then raise exception ''decimal_stock_contract_pending''; end if;','');
  if patched=f then raise exception 'integer-only decimal guard not found'; end if;
  execute patched;
 end $decimal$;`);
 await db.exec(reconciliationMigration);
 await db.exec(`insert into warehouse_voucher_settings values('${org}',true,true,true);
 insert into warehouse_voucher_access values('${org}','${requester}',true,false,false,now()+interval '1 day','synthetic'),('${org}','${approver}',true,true,true,now()+interval '1 day','synthetic');
 insert into warehouse_voucher_stock_activation(stock_id,count_id,activated_by) values('${stock}','${count}','${approver}');`);
 return db;
}
const body=(rid=10,quantity='2')=>({requestId:id(rid),warehouseId:warehouse,workOrderId:ot,receiverId:receiver,reason:'Prueba aislada',lines:[{productId:product,quantity}]});
async function cmd(db,actor,action,payload,organization=org){const r=await db.query('select warehouse_voucher_command_v1($1,$2,$3,$4) result',[organization,actor,action,JSON.stringify(payload)]);return r.rows[0].result;}
async function approved(db,rid=10,quantity='2'){const v=await cmd(db,requester,'create',body(rid,quantity));await cmd(db,approver,'approve',{requestId:id(rid+100),voucherId:v.id,reason:'Aprobado QA'});return (await db.query('select * from warehouse_consumption_vouchers where id=$1',[v.id])).rows[0];}
async function deliverBody(db,v,rid=200,quantity='1'){const l=(await db.query('select id from warehouse_consumption_voucher_lines where voucher_id=$1',[v.id])).rows[0];return {requestId:id(rid),voucherId:v.id,lineId:l.id,qrReference:v.qr_reference,receiverId:receiver,physicalConfirmed:true,quantity};}
async function balance(db){return Number((await db.query('select quantity_on_hand from warehouse_stock')).rows[0].quantity_on_hand);}

test('wire contract preserves decimals; rejects duplicate products, exponent, zero and missing receiver',()=>{
 assert.equal(voucherInput({...body(),lines:[{productId:product,quantity:'0,75'}]}).lines[0].quantity,'0.75');
 for(const bad of ['0','-1','1e3','1.0000001','NaN'])assert.throws(()=>voucherInput(body(10,bad)));
 assert.throws(()=>voucherInput({...body(),receiverId:null}));
 assert.throws(()=>voucherInput({...body(),lines:[...body().lines,...body().lines]}));
});
test('migration defaults deny; RLS and service-only command',async()=>{const db=await fixture();try{
 await db.exec('update warehouse_voucher_settings set enabled=false');
 await assert.rejects(()=>cmd(db,requester,'create',body()),/pilot_disabled/);
 const r=await db.query("select relrowsecurity from pg_class where relname='warehouse_consumption_vouchers'");assert.equal(r.rows[0].relrowsecurity,true);
 const p=await db.query("select has_function_privilege('authenticated','warehouse_voucher_command_v1(uuid,uuid,text,jsonb)','execute') allowed");assert.equal(p.rows[0].allowed,false);
}finally{await db.close();}});
test('create retries are exact and never change stock',async()=>{const db=await fixture();try{
 const a=await cmd(db,requester,'create',body());assert.equal((await cmd(db,requester,'create',body())).id,a.id);
 await assert.rejects(()=>cmd(db,requester,'create',body(10,'1')),/idempotency_conflict/);assert.equal(await balance(db),2);
}finally{await db.close();}});
test('tenant, expired capability, inactive actor, and self-approval denied',async()=>{const db=await fixture();try{
 await assert.rejects(()=>cmd(db,requester,'create',body(),id(99)),/pilot_disabled/);
 const v=await cmd(db,approver,'create',body());await assert.rejects(()=>cmd(db,approver,'approve',{requestId:id(55),voucherId:v.id,reason:'Yo mismo'}),/not_authorized/);
 await db.exec(`update warehouse_voucher_access set expires_at=now()-interval '1 second' where profile_id='${requester}'`);await assert.rejects(()=>cmd(db,requester,'create',body()),/not_authorized/);
 await db.exec(`update profiles set status='inactive' where id='${approver}'`);await assert.rejects(()=>cmd(db,approver,'cancel',{requestId:id(56),voucherId:v.id}),/not_authorized/);
}finally{await db.close();}});
test('approval and QR viewing confer no stock movement; partial delivery exact retry once',async()=>{const db=await fixture();try{
 const v=await approved(db);assert.equal(await balance(db),2);const b=await deliverBody(db,v);await cmd(db,approver,'deliver',b);await cmd(db,approver,'deliver',b);assert.equal(await balance(db),1);
 assert.equal((await db.query('select count(*)::int n from stock_movements')).rows[0].n,1);
 await assert.rejects(()=>cmd(db,approver,'deliver',{...b,quantity:'2'}),/idempotency_conflict/);
}finally{await db.close();}});
test('invalid QR and no physical confirmation deny without stock write',async()=>{const db=await fixture();try{
 const v=await approved(db);const b=await deliverBody(db,v);
 await assert.rejects(()=>cmd(db,approver,'deliver',{...b,qrReference:id(999)}),/invalid_qr_or_state/);
 await assert.rejects(()=>cmd(db,approver,'deliver',{...b,physicalConfirmed:false}),/physical_confirmation_required/);
 await assert.rejects(()=>cmd(db,requester,'deliver',b),/not_authorized/);assert.equal(await balance(db),2);
}finally{await db.close();}});
test('two competing vouchers cannot consume same last stock; reserved stock preserved',async()=>{const db=await fixture();try{
 const a=await approved(db),b=await approved(db,11);await db.exec('update warehouse_stock set quantity_on_hand=1');
 await cmd(db,approver,'deliver',await deliverBody(db,a));await assert.rejects(async()=>cmd(db,approver,'deliver',await deliverBody(db,b,201)),/insufficient_available/);assert.equal(await balance(db),0);
 await db.exec('update warehouse_stock set quantity_on_hand=2,quantity_reserved=2');await assert.rejects(async()=>cmd(db,approver,'deliver',await deliverBody(db,b,202)),/insufficient_available/);
}finally{await db.close();}});
test('fractional delivery remains exact; unreconciled handoff queues without changing canonical stock',async()=>{const db=await fixture();try{
 const v=await approved(db,10,'0.75');const fractional=await deliverBody(db,v,200,'0.75');
 await cmd(db,approver,'deliver',fractional);assert.equal(await balance(db),1.25);
 assert.equal(Number((await db.query('select quantity from stock_movements')).rows[0].quantity),0.75);
 assert.equal(Number((await db.query('select delivered from warehouse_consumption_voucher_lines where voucher_id=$1',[v.id])).rows[0].delivered),0.75);
 const w=await approved(db,11,'1');await db.exec('delete from warehouse_voucher_stock_activation');const pending=await deliverBody(db,w,201);
 await assert.rejects(()=>cmd(db,approver,'deliver',pending),/stock_reconciliation_ack_required/);assert.equal(await balance(db),1.25);
 const delivered=await cmd(db,approver,'deliver',{...pending,unreconciledStockConfirmed:true});assert.equal(delivered.status,'delivered');assert.equal(await balance(db),1.25);
 assert.equal((await db.query('select count(*)::int n from warehouse_voucher_stock_reconciliation_queue where status=\'pending\'')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from stock_movements')).rows[0].n,1);
 const x=await approved(db,12,'1');await db.exec("update bodega_inventory_operational_service_v1 set reconciliation_state='quantity_mismatch'");
 const unaligned=await deliverBody(db,x,202);await assert.rejects(()=>cmd(db,approver,'deliver',unaligned),/stock_reconciliation_ack_required/);
 await cmd(db,approver,'deliver',{...unaligned,unreconciledStockConfirmed:true});
 assert.equal(await balance(db),1.25);assert.equal((await db.query('select count(*)::int n from warehouse_voucher_stock_reconciliation_queue where status=\'pending\'')).rows[0].n,2);
}finally{await db.close();}});
test('failed movement rolls back stock and line; rejected/cancelled/expired cannot deliver',async()=>{const db=await fixture();try{
 const v=await approved(db);const b=await deliverBody(db,v);await db.exec("alter table stock_movements add constraint forced_failure check(false)");await assert.rejects(()=>cmd(db,approver,'deliver',b));assert.equal(await balance(db),2);assert.equal((await db.query('select delivered from warehouse_consumption_voucher_lines')).rows[0].delivered,'0.000000');
 await db.exec('alter table stock_movements drop constraint forced_failure');await cmd(db,requester,'cancel',{requestId:id(300),voucherId:v.id});await assert.rejects(()=>cmd(db,approver,'deliver',b),/invalid_qr_or_state/);
 const w=await approved(db,11);await db.exec(`update warehouse_consumption_vouchers set expires_at=now()-interval '1 second' where id='${w.id}'`);await assert.rejects(async()=>cmd(db,approver,'deliver',await deliverBody(db,w,301)),/voucher_expired/);
}finally{await db.close();}});
test('reject and cancel preserve stock; duplicate material creation rolls back header',async()=>{const db=await fixture();try{
 const input=body();input.lines.push({...input.lines[0]});await assert.rejects(()=>cmd(db,requester,'create',input));assert.equal((await db.query('select count(*)::int n from warehouse_consumption_vouchers')).rows[0].n,0);
 const v=await cmd(db,requester,'create',body());await cmd(db,approver,'reject',{requestId:id(60),voucherId:v.id,reason:'Material incorrecto'});await assert.rejects(async()=>cmd(db,approver,'deliver',await deliverBody(db,v)),/invalid_qr_or_state/);assert.equal(await balance(db),2);
}finally{await db.close();}});
test('receiver, material unit and work order are revalidated at delivery',async()=>{const db=await fixture();try{
 const v=await approved(db),b=await deliverBody(db,v);
 await db.exec(`update profiles set status='inactive' where id='${receiver}'`);await assert.rejects(()=>cmd(db,approver,'deliver',b),/invalid_receiver/);
 await db.exec(`update profiles set status='active' where id='${receiver}';update canonical.products set unit='kg'`);await assert.rejects(()=>cmd(db,approver,'deliver',b),/invalid_product/);
 await db.exec("update canonical.products set unit='Unidad';update maintenance_work_orders set status='completed'");await assert.rejects(()=>cmd(db,approver,'deliver',b),/invalid_work_order/);assert.equal(await balance(db),2);
}finally{await db.close();}});
test('delivery requires explicit activation; completing a voucher prevents another withdrawal',async()=>{const db=await fixture();try{
 const v=await approved(db),b=await deliverBody(db,v,200,'2');await db.exec('update warehouse_voucher_settings set deliveries_enabled=false');await assert.rejects(()=>cmd(db,approver,'deliver',b),/delivery_activation_pending/);
 await db.exec('update warehouse_voucher_settings set deliveries_enabled=true');const done=await cmd(db,approver,'deliver',b);assert.equal(done.status,'delivered');assert.equal(await balance(db),0);await assert.rejects(()=>cmd(db,approver,'deliver',{...b,requestId:id(201)}),/invalid_qr_or_state/);
}finally{await db.close();}});

test('stock movement uses linked auth identity while voucher audit keeps profile actor',async()=>{const db=await fixture();try{const v=await approved(db);await cmd(db,approver,'deliver',await deliverBody(db,v));assert.equal((await db.query("select performed_by from stock_movements")).rows[0].performed_by,id(30));assert.equal((await db.query("select actor_id from warehouse_consumption_voucher_events where action='deliver'")).rows[0].actor_id,approver);}finally{await db.close();}});
