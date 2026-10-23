import test from 'node:test';import assert from 'node:assert/strict';import {sessionCipher,createPostgresStore} from '../lib/integrations/laudus/postgres-store.mjs';import {normalizedRut,reconcileSuppliers} from '../lib/integrations/laudus/supplier-reconciliation.mjs';
test('token is authenticated encrypted and bound to tenant/company',()=>{const c=sessionCipher(Buffer.alloc(32,9));const value=c.seal({token:'private'},'tenant/company');assert.ok(!value.includes('private'));assert.deepEqual(c.open(value,'tenant/company'),{token:'private'});assert.throws(()=>c.open(value,'other/company'),/DECRYPTION/);assert.throws(()=>sessionCipher(Buffer.alloc(4)),/KEY/);});
test('RUT verification normalizes formatting and rejects bad check digit',()=>{assert.equal(normalizedRut('84.542.800-k'),'84542800-K');assert.equal(normalizedRut('84.542.800-1'),null);});
test('duplicate or missing RUT never silently merges supplier identities',()=>{const canonical=[{id:'a',tax_id:'84.542.800-K'}];const source=[{supplierId:1,VATId:'84542800-k'},{supplierId:2,VATId:'bad'}];const result=reconcileSuppliers(source,canonical);assert.equal(result[0].canonicalId,'a');assert.equal(result[1].status,'invalid_rut');assert.equal(reconcileSuppliers([source[0],source[0]],canonical)[0].status,'duplicate_source');assert.equal(reconcileSuppliers([source[0]],[...canonical,...canonical])[0].status,'ambiguous');});
test('store denies calls outside locked tenant scope',async()=>{const store=createPostgresStore({pool:{},key:Buffer.alloc(32)});await assert.rejects(store.reserveCall({organizationId:'a',companyVATId:'b'}),/NOT_LOCKED/);});
import {santiagoTimestamp} from '../lib/integrations/laudus/suppliers.mjs';
test('Laudus filter clock uses Santiago local time in summer and winter',()=>{assert.equal(santiagoTimestamp(new Date('2026-10-23T12:00:00Z')),'2026-10-23T09:00:00');assert.equal(santiagoTimestamp(new Date('2026-06-23T12:00:00Z')),'2026-06-23T08:00:00');});
test('overlapping jobs are rejected before acquiring another connection',async()=>{
 let finish;const hold=new Promise(resolve=>{finish=resolve;});let connections=0;
 const client={query:async()=>({rows:[{locked:true}]}),release:()=>{}};
 const store=createPostgresStore({pool:{connect:async()=>{connections++;return client;}},key:Buffer.alloc(32)});
 const scope={organizationId:'one',companyVATId:'84542800-K'};
 const first=store.withLock(scope,async()=>hold);
 await assert.rejects(store.withLock(scope,async()=>{}),/ALREADY_BUSY/);
 finish();await first;assert.equal(connections,1);
});
