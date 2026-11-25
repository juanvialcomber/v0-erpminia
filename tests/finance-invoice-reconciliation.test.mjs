import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync('app/api/finance/invoice-reconciliation/route.ts','utf8');
function harness({authorized=true,contextOk=true,error=null,data={summary:{},total:0,rows:[]}}={}) {
  const calls=[];
  const module={exports:{}};
  const context=contextOk ? {ok:true,organizationId:'tenant-a',supabase:{async rpc(name,args){calls.push({name,args});return {data,error};}}} : {ok:false,response:{status:401}};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    module,exports:module.exports,console:{error(){}},require(name){
      if(name==='next/server')return {NextResponse:{json(body,options){return {body,...options,status:options?.status??200};}}};
      if(name==='@/lib/api/organization-context')return {getOrganizationContext:async()=>context};
      if(name==='@/lib/api/module-access')return {MODULE_KEYS:{FIN_FINANZAS:'fin_finanzas'},requireModuleAccess:async(_request,key)=>{assert.equal(key,'fin_finanzas');return authorized?{authorized:true}:{authorized:false,response:{status:403}};}};
      throw new Error('Unexpected module '+name);
    }
  });
  return {calls,GET:module.exports.GET};
}
const request=(query='')=>({nextUrl:new URL('https://example.test/api/finance/invoice-reconciliation?'+query)});
test('reconciliation denies missing finance access and session before database access',async()=>{
  for(const [options,status] of [[{authorized:false},403],[{contextOk:false},401]]){
    const h=harness(options);
    assert.equal((await h.GET(request())).status,status);
    assert.equal(h.calls.length,0);
  }
});
test('reconciliation uses session tenant and bounded pagination',async()=>{
  const h=harness();
  const result=await h.GET(request('organizationId=tenant-b&page=2&status=currency_missing'));
  assert.equal(result.status,200);
  assert.equal(result.headers['Cache-Control'],'private, no-store');
  assert.equal(h.calls[0].name,'motil_invoice_reconciliation_v1');
  assert.equal(h.calls[0].args.p_organization_id,'tenant-a');
  assert.equal(h.calls[0].args.p_offset,50);
  assert.equal(h.calls[0].args.p_limit,50);
  assert.equal(h.calls[0].args.p_status,'currency_missing');
});
test('reconciliation rejects invalid filters before query',async()=>{
  for(const query of ['page=0','page=1.5','page=10001','page=Infinity','status=unknown']){
    const h=harness();
    assert.equal((await h.GET(request(query))).status,400);
    assert.equal(h.calls.length,0);
  }
});
test('reconciliation distinguishes empty results from failed or malformed database responses',async()=>{
  assert.equal((await harness().GET(request())).status,200);
  for(const options of [{error:{code:'XX000'}},{data:null},{data:[]}]){
    const result=await harness(options).GET(request());
    assert.equal(result.status,503);
    assert.equal(result.body.error.includes('XX000'),false);
  }
});
