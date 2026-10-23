import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Laudus three-way intelligence stays read-only and service-role only', () => {
  const migration = fs.readFileSync('supabase/migrations/20261023211500_laudus_three_way_match_preview.sql','utf8');
  const route = fs.readFileSync('app/api/integrations/laudus/operational-intelligence/route.ts','utf8');
  const card = fs.readFileSync('components/integrations/laudus-operational-intelligence-card.tsx','utf8');

  assert.match(migration,/revoke all on function/);
  assert.match(migration,/grant execute .*service_role/);
  assert.match(migration,/idx_laudus_invoice_lines_match/);
  assert.match(route,/motil_laudus_three_way_match_preview/);
  assert.match(route,/requireModuleAccess/);
  assert.match(card,/Three-way match por línea/);
  assert.match(card,/No aprueba pagos ni modifica documentos/);
});
