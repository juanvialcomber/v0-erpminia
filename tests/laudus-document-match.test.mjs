import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('document-first Laudus matching is candidate-only and commercially documented', () => {
  const migration=fs.readFileSync('supabase/migrations/20261023214500_laudus_document_match_preview.sql','utf8');
  const route=fs.readFileSync('app/api/integrations/laudus/operational-intelligence/route.ts','utf8');
  const card=fs.readFileSync('components/integrations/laudus-operational-intelligence-card.tsx','utf8');
  const value=fs.readFileSync('docs/commercial/motil-value-ledger.md','utf8');

  assert.match(migration,/candidate_only/);
  assert.match(migration,/revoke all on function/);
  assert.match(migration,/grant execute .*service_role/);
  assert.match(route,/motil_laudus_document_match_preview/);
  assert.match(card,/Resolución documental/);
  assert.match(value,/dato -> inteligencia -> decisión -> resultado -> capacidad comercial/i);
  assert.match(value,/2\.306/);
});
