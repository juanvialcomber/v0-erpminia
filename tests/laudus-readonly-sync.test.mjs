import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadonlySync} from '../lib/integrations/laudus/readonly-sync.mjs';
const credentials={organizationId:'tenant',companyVATId:'test',userName:'technical',password:'test-only'};
const contract={domain:'suppliers',verified:true,version:'fixture',path:'/test/suppliers/list',idField:'id',modifiedField:'modified',fields:['id','modified']};
function fixture({budget=true, pages=[[]], status=200}={}) {
 const calls=[], commits=[]; let state; let page=0;
 const store={withLock:async(_,fn)=>fn(),reserveCall:async()=>budget,recordResult:async()=>{},readState:async()=>state,commitPage:async p=>{commits.push(p);state=p.state;}};
 const fetchImpl=async(url,options)=>{calls.push({url,options});return url.endsWith('/login') ? Response.json({token:'private',expiration:'2030-01-01T00:00:00Z'}) : Response.json(pages[page++] || [],{status});};
 return {client:createReadonlySync({credentials,store,fetchImpl,now:()=>new Date('2026-10-22T12:00:00Z')}),calls,commits};
}
test('fails closed without credentials',()=>assert.throws(()=>createReadonlySync({}),/CREDENTIALS/));
test('unknown budget sends no requests',async()=>{const f=fixture({budget:false});await assert.rejects(f.client.sync({domain:'suppliers',contract}),/BUDGET/);assert.equal(f.calls.length,0);});
test('rejects write path and unverified contract before network',async()=>{const f=fixture();await assert.rejects(f.client.sync({domain:'suppliers',contract:{...contract,path:'/purchases/orders'}}),/CONTRACT/);assert.equal(f.calls.length,0);});
test('commits scoped evidence then serves cache without API calls',async()=>{const f=fixture({pages:[[{id:1,modified:'2026-10-21'}]]});assert.equal((await f.client.sync({domain:'suppliers',contract})).status,'complete');assert.equal(f.commits[0].organizationId,'tenant');assert.equal(f.commits[0].module,'fin_compras');assert.equal((await f.client.sync({domain:'suppliers',contract})).status,'cached');assert.equal(f.calls.length,2);assert.equal(f.calls[1].options.redirect,'error');});
test('partial page persists checkpoint without advancing watermark',async()=>{const f=fixture({pages:[[{id:1,modified:'2026-10-21'}]],status:206});assert.equal((await f.client.sync({domain:'suppliers',contract,maxPages:1})).status,'paused');assert.equal(f.commits[0].state.offset,1);assert.equal(f.commits[0].state.watermark,undefined);});
test('bad payload does not checkpoint',async()=>{const f=fixture({pages:[[{id:1}]]});await assert.rejects(f.client.sync({domain:'suppliers',contract}),/INVALID_PAGE/);assert.equal(f.commits.length,0);});
test('per-run limit includes login and stops before another page',async()=>{
 const f=fixture({pages:[[{id:1,modified:'2026-10-21'}]],status:206});
 const result=await f.client.sync({domain:'suppliers',contract,maxCalls:2});
 assert.deepEqual(result,{status:'paused',pages:1,calls:2});
 assert.equal(f.calls.length,2);
});
test('monthly ceiling cannot exceed safety margin',()=>assert.throws(()=>createReadonlySync({credentials,monthlyCeiling:2001}),/MONTHLY_CEILING/));
test('page sizes above verified endpoint limit are rejected',async()=>{
 const f=fixture();await assert.rejects(f.client.sync({domain:'suppliers',contract,pageSize:500}),/PAGE_SIZE/);assert.equal(f.calls.length,0);
});
test('protected shared session avoids login across fresh instances',async()=>{
 let saved; let clock=new Date('2026-10-22T12:00:00Z');let loginCount=0;let reservations=0;
 const store={withLock:async(_,fn)=>fn(),reserveCall:async({ceiling})=>{assert.equal(ceiling,1800);reservations++;return true;},recordResult:async()=>{},readState:async()=>null,commitPage:async()=>{},readSession:async()=>saved,writeSession:async({session})=>{saved=session;}};
 const fetchImpl=async url=>{if(url.endsWith('/login')){loginCount++;return Response.json({token:'private',expiration:'2026-10-23T12:00:00Z'});}return Response.json([]);};
 for(let i=0;i<2;i++) await createReadonlySync({credentials,store,fetchImpl,now:()=>clock}).sync({domain:'suppliers',contract});
 assert.equal(loginCount,1);assert.equal(reservations,3);
 clock=new Date('2026-10-23T11:59:30Z');
 await assert.rejects(createReadonlySync({credentials,store,fetchImpl,now:()=>clock}).sync({domain:'suppliers',contract}),/INVALID_SESSION/);
 assert.equal(loginCount,2);
});
