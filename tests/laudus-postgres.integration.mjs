import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPostgresStore} from '../lib/integrations/laudus/postgres-store.mjs';
const modulePath=process.env.LAUDUS_PGLITE_MODULE;
test('isolated PostgreSQL schema, budget, encryption, idempotency and rollback', {skip:!modulePath},async()=>{
 const {PGlite}=await import(modulePath);const pg=new PGlite();
 try {
 await pg.exec('create role anon; create role authenticated; create table public.organizations(id uuid primary key);');
 await pg.exec(await readFile(new URL('../database/proposals/laudus-readonly-store.sql',import.meta.url),'utf8'));
 const org='00000000-0000-4000-8000-000000000001';const scope={organizationId:org,companyVATId:'84.542.800-K'};
 await pg.query('insert into organizations values($1)',[org]);
 const client={query:async(sql,args)=>{const r=await pg.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length};},release:()=>{}};
 const store=createPostgresStore({pool:{connect:async()=>client},key:Buffer.alloc(32,2)});
 await store.withLock(scope,async()=>{
  assert.equal(await store.reserveCall({...scope,month:'2026-10',ceiling:1800}),false);
  await pg.query("insert into motil_laudus.monthly_usage values('84542800-K','2026-10',$1,1799,0,now()+interval '1 hour')",[org]);
  assert.equal(await store.reserveCall({...scope,month:'2026-10',ceiling:1800}),true);
  assert.equal(await store.reserveCall({...scope,month:'2026-10',ceiling:1800}),false);
  await store.writeSession({...scope,session:{token:'secret-fixture',expiration:'2030-01-01'}});
  assert.equal((await store.readSession(scope)).token,'secret-fixture');
  const encrypted=await pg.query('select ciphertext from motil_laudus.sessions');assert.ok(!encrypted.rows[0].ciphertext.includes('secret-fixture'));
  const page={...scope,domain:'suppliers',module:'fin_compras',idField:'supplierId',rows:[{supplierId:1,name:'fixture'}],state:{offset:1}};
  await store.commitPage(page);await store.commitPage(page);
  assert.equal((await pg.query('select count(*)::int as n from motil_laudus.evidence')).rows[0].n,1);
  await assert.rejects(store.commitPage({...page,rows:[{supplierId:2}],state:undefined}));
  assert.equal((await pg.query('select count(*)::int as n from motil_laudus.evidence')).rows[0].n,1);
  assert.deepEqual(await store.readState({...scope,domain:'suppliers'}),{offset:1});
  await assert.rejects(store.readSession({...scope,organizationId:'other'}),/SCOPE/);
 });
 const perms=await pg.query("select has_schema_privilege('authenticated','motil_laudus','usage') as allowed");assert.equal(perms.rows[0].allowed,false);
 }finally{await pg.close();}
});
