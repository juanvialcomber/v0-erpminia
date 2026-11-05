import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('app/api/sii/replacement-readiness/route.ts','utf8');
const card = fs.readFileSync('components/sii/sii-laudus-replacement-card.tsx','utf8');
const page = fs.readFileSync('app/dashboard/administracion/sii/preparacion/page.tsx','utf8');

test('SII direct is the target fiscal authority for replacing Laudus DTE',()=>{
  assert.match(route,/authorityTarget: 'SII_DIRECT'/);
  assert.match(route,/historical_reference_only/);
  assert.match(route,/adequateAsFiscalAuthority: false/);
  assert.match(card,/autoridad fiscal objetivo es SII directo/);
  assert.match(page,/SiiLaudusReplacementCard/);
});

test('replacement readiness is read only and does not emit or file anything',()=>{
  assert.match(route,/emitsDte: false/);
  assert.match(route,/consumesCaf: false/);
  assert.match(route,/filesTaxReturn: false/);
  assert.match(route,/paysTax: false/);
  assert.doesNotMatch(route,/\.insert\(/);
  assert.doesNotMatch(route,/\.update\(/);
  assert.doesNotMatch(route,/\.upsert\(/);
});
