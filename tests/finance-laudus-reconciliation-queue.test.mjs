import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync('app/api/integrations/laudus/finance-reconciliation-review/route.ts','utf8');
const queue=fs.readFileSync('components/integrations/laudus-finance-reconciliation-queue.tsx','utf8');

test('finance review queue includes missing supplier and document conflicts',()=>{
  assert.match(route,/laudus-ap-missing-supplier/);
  assert.match(route,/laudus-ap-document-type-conflict/);
  assert.match(route,/reviewPriority/);
  assert.match(route,/high_confidence/);
  assert.match(route,/conflict/);
});

test('finance review decisions preserve prior reconciliation evidence',()=>{
  assert.match(route,/select\('id,issue_key,status,resolution_note'\)/);
  assert.match(route,/review\.resolution_note/);
  assert.match(route,/canonical_mutation=false/);
  assert.match(route,/laudus_mutation=false/);
});

test('finance queue exposes priority and candidate evidence without automatic mutation',()=>{
  assert.match(queue,/Alta confianza/);
  assert.match(queue,/Conflicto/);
  assert.match(queue,/resolutionNote/);
  assert.match(queue,/no asigna proveedor ni cambia el documento automáticamente/);
  assert.match(queue,/Aprobar/);
  assert.match(queue,/Rechazar/);
});
