import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const proxy = readFileSync('proxy.ts','utf8');
const start = proxy.indexOf('function financeManagerAllowed(');
const end = proxy.indexOf('\nfunction isPublicApiRoute(',start);
const source = proxy.slice(start,end);
const sandbox = {};
runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
const path = '/api/integrations/laudus/finance-reconciliation-review';
test('finance manager may read or submit an evidence decision through the exact route',()=>{
  for(const method of ['GET','HEAD','OPTIONS','POST']) assert.equal(sandbox.financeManagerAllowed(path,method),true);
  for(const method of ['PATCH','PUT','DELETE']) assert.equal(sandbox.financeManagerAllowed(path,method),false);
  assert.equal(sandbox.financeManagerAllowed(path+'/other','POST'),false);
  assert.equal(sandbox.financeManagerAllowed('/api/integrations/laudus/unrelated','POST'),false);
});
