import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261024012500_supply_value_evidence.sql','utf8');
const route=fs.readFileSync('app/api/procurement/supply-risk/route.ts','utf8');
const card=fs.readFileSync('components/integrations/supply-risk-card.tsx','utf8');

test('value evidence cannot masquerade as accounting truth',()=>{
  assert.match(sql,/Amounts are evidence records, not audited savings or accounting truth/);
  assert.match(sql,/evidence_level.*E2.*E3/s);
  assert.match(route,/accountingModified: false/);
  assert.match(route,/basisNote\.length < 10/);
  assert.match(card,/No equivale a ahorro auditado/);
});

test('E3 requires an evidence reference while E2 remains observed evidence',()=>{
  assert.match(route,/evidenceReference\.length >= 5 \? 'E3' : 'E2'/);
  assert.match(card,/E2 = observado\/declarado/);
  assert.match(card,/E3 = observado con referencia/);
});
