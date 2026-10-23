import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync('app/api/integrations/laudus/match-reviews/route.ts','utf8');
const card=fs.readFileSync('components/integrations/laudus-match-review-inbox.tsx','utf8');
const migration=fs.readFileSync('supabase/migrations/20261023221500_laudus_match_review_decisions.sql','utf8');

test('Laudus match review decisions are human-only feedback',()=>{
  assert.match(route,/FIN_COMPRAS/);
  assert.match(route,/sourceModified: false/);
  assert.match(route,/canonicalModified: false/);
  assert.match(route,/Indica el motivo del rechazo/);
  assert.doesNotMatch(route,/procurement_supplier_invoices[\s\S]{0,200}update/);
  assert.doesNotMatch(route,/laudus_purchase_orders[\s\S]{0,200}update/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/grant select, insert .* service_role/);
  assert.match(card,/Aprobar/);
  assert.match(card,/Rechazar/);
  assert.match(card,/Motivo del rechazo/);
});
