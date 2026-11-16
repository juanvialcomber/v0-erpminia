import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const ts = await readFile(new URL('../lib/engineering/request-approval-policy.ts', import.meta.url), 'utf8');
const policy = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(stripTypeScriptTypes(ts, { mode: 'strip' })));
const api = await readFile(new URL('../app/api/ingenieria/proyectos/route.ts', import.meta.url), 'utf8');
const request = (changesApprovedProgram=false, priority='normal', approvals=[], state='en_revision_supervision') => ({
  id:'req-1', organizationId:'la-patagua', requestingDepartmentId:'operaciones',
  changesApprovedProgram, priority, classifiedByEngineeringId:'cristian',
  classifiedAt:'2026-11-16T15:00:00Z', approvals, state,
});
const signature = (role, actorId='supervisor') => ({
  role, actorId, decision:'aprobar', signedAt:'2026-11-16T15:01:00Z', evidenceId:'doc-1',
});
const supervisor = {id:'supervisor',organizationId:'la-patagua',role:'supervision',canApprove:true};
const ceo = {id:'ceo',organizationId:'la-patagua',role:'gerencia',canApprove:true};

test('normal/high requests without program change need supervisor only; CEO cannot intervene',()=>{
  assert.deepEqual(policy.requiredEngineeringApprovals(request()),['supervision']);
  assert.deepEqual(policy.requiredEngineeringApprovals(request(false,'alta')),['supervision']);
  assert.equal(policy.evaluateEngineeringApproval(request(),ceo,'aprobar').allowed,false);
  assert.equal(policy.evaluateEngineeringApproval(request(),supervisor,'aprobar').nextState,'aprobada');
});
test('all program changes and urgent/critical requests require exactly supervisor then CEO',()=>{
  for (const variant of [request(true,'normal'),request(false,'urgente'),request(false,'critica'),request(true,'alta')]){
    assert.deepEqual(policy.requiredEngineeringApprovals(variant),['supervision','gerencia']);
    assert.equal(policy.evaluateEngineeringApproval(variant,ceo,'aprobar').allowed,false);
    assert.equal(policy.evaluateEngineeringApproval(variant,supervisor,'aprobar').nextState,'pendiente_gerencia');
    variant.approvals=[signature('supervision')];
    variant.state='pendiente_gerencia';
    assert.equal(policy.evaluateEngineeringApproval(variant,ceo,'aprobar').nextState,'aprobada');
    assert.equal(policy.evaluateEngineeringApproval(variant,supervisor,'aprobar').allowed,false);
  }
});
test('deny missing evidence, repeated signer, wrong stage, rejected or forged previous signature',()=>{
  const invalid=[
    {request:request(true,'critica',[{...signature('supervision'),evidenceId:''}],'pendiente_gerencia'),actor:ceo},
    {request:request(true,'critica',[{...signature('supervision'),signedAt:''}],'pendiente_gerencia'),actor:ceo},
    {request:request(true,'critica',[{...signature('supervision'),decision:'rechazar'}],'pendiente_gerencia'),actor:ceo},
    {request:request(true,'critica',[signature('gerencia')],'pendiente_gerencia'),actor:ceo},
    {request:request(true,'critica',[signature('supervision')],'en_revision_supervision'),actor:supervisor},
    {request:request(true,'critica',[signature('supervision')],'pendiente_gerencia'),actor:{...ceo,id:'supervisor'}},
    {request:request(true,'critica',[signature('supervision')],'pendiente_gerencia'),actor:{...ceo,organizationId:'another-tenant'}},
    {request:request(true,'critica',[signature('supervision')],'pendiente_gerencia'),actor:{...ceo,canApprove:false}},
  ];
  for(const item of invalid){
    assert.equal(policy.evaluateEngineeringApproval(item.request,item.actor,'aprobar').allowed,false);
  }
});
test('classification must be manual by engineering lead, before signatures',()=>{
  const r=request();
  r.classifiedByEngineeringId=null;
  r.classifiedAt=null;
  assert.equal(policy.evaluateEngineeringApproval(r,supervisor,'aprobar').allowed,false);
  assert.throws(()=>policy.classifyEngineeringRequest(r,{
    priority:'critica', actorId:'ceo', actorOrganizationId:'la-patagua',
    isEngineeringLead:false,classifiedAt:'2026-11-16T15:00:00Z',
  }));
  const tagged=policy.classifyEngineeringRequest(r,{
    priority:'critica',actorId:'cristian',actorOrganizationId:'la-patagua',
    isEngineeringLead:true,classifiedAt:'2026-11-16T15:00:00Z',
  });
  assert.equal(tagged.changesApprovedProgram,true);
  assert.throws(()=>policy.classifyEngineeringRequest(tagged,{
    priority:'normal',actorId:'cristian',actorOrganizationId:'la-patagua',
    isEngineeringLead:true,classifiedAt:'2026-11-16T15:02:00Z',
  }),/revisión auditada/);
  assert.deepEqual(policy.requiredEngineeringApprovals(tagged),['supervision','gerencia']);
  assert.throws(()=>policy.classifyEngineeringRequest({...tagged,approvals:[signature('supervision')]},{
    priority:'normal',actorId:'cristian',actorOrganizationId:'la-patagua',
    isEngineeringLead:true,classifiedAt:'2026-11-16T15:03:00Z',
  }));
});
test('request discovery remains read only until approved workflow persistence exists',()=>{
  assert.doesNotMatch(api, /export async function (POST|PATCH|PUT|DELETE)/);
  assert.match(api,/readOnly: true/);
});
