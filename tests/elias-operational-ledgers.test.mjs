import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261106172000_elias_operational_ledgers.sql', 'utf8');
const identityMigration = fs.readFileSync('supabase/migrations/20261106173500_transport_settlement_identity.sql', 'utf8');
const api = fs.readFileSync('app/api/finance/transport-settlements/route.ts', 'utf8');
const page = fs.readFileSync('app/dashboard/finanzas/transportistas/page.tsx', 'utf8');
const layout = fs.readFileSync('app/dashboard/finanzas/layout.tsx', 'utf8');
const miningApi = fs.readFileSync('app/api/legal/mining-property/route.ts', 'utf8');

test('transport settlements are tenant-scoped source ledgers, not payment instructions', () => {
  assert.match(migration, /create table if not exists public\.transport_settlements/i);
  assert.match(migration, /source_fingerprint text not null/i);
  assert.match(migration, /unique \(organization_id, source_fingerprint\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(api, /MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(api, /readOnly: true/);
  assert.match(api, /No constituyen una instrucción de pago/);
});

test('carrier RUT is preserved for deterministic supplier reconciliation', () => {
  assert.match(identityMigration, /add column if not exists carrier_rut text/i);
  assert.match(api, /carrier_rut/);
  assert.match(page, /Sin RUT en fuente/);
  assert.match(page, /Conciliado/);
  assert.match(page, /Por conciliar/);
});

test('finance navigation exposes transporter settlements as a first-class view', () => {
  assert.match(layout, /\/dashboard\/finanzas\/transportistas/);
  assert.match(page, /Finanzas · Transportistas/);
});

test('mining-property API reads canonical property and royalty ledgers', () => {
  assert.match(miningApi, /from\('mining_properties'\)/);
  assert.match(miningApi, /from\('mining_property_royalties'\)/);
  assert.match(miningApi, /royalties_clp/);
});
