import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Laudus operational intelligence remains candidate-only and authenticated', () => {
  const route = fs.readFileSync('app/api/integrations/laudus/operational-intelligence/route.ts', 'utf8');
  const migration = fs.readFileSync('supabase/migrations/20261023204500_laudus_operational_intelligence_preview.sql', 'utf8');
  const card = fs.readFileSync('components/integrations/laudus-operational-intelligence-card.tsx', 'utf8');

  assert.match(route, /requireModuleAccess/);
  assert.match(route, /FIN_COMPRAS/);
  assert.match(route, /motil_laudus_operational_intelligence_preview/);
  assert.match(migration, /revoke all on function/);
  assert.match(migration, /grant execute .* service_role/);
  assert.match(migration, /candidate_only/);
  assert.match(card, /Un empate nunca se convierte en match automático/);
});
