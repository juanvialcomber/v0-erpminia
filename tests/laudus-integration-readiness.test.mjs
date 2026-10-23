import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const model = readFileSync(new URL('../lib/integrations/laudus/model.ts', import.meta.url), 'utf8');
const reconcile = readFileSync(new URL('../lib/integrations/laudus/reconcile.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261022150000_laudus_integration_intake.sql', import.meta.url), 'utf8');

test('Laudus mapping never auto-applies external data to canonical MOTIL state', () => {
  assert.match(model, /autoApply: false/g);
  assert.doesNotMatch(model, /autoApply: true/);
});

test('integration intake keeps raw evidence and a separate reconciliation queue', () => {
  assert.match(migration, /integration\.raw_records/);
  assert.match(migration, /integration\.reconciliation_items/);
  assert.match(migration, /payload_hash text not null/);
  assert.match(migration, /unique \(source_id, entity_type, external_id, payload_hash\)/);
});

test('private integration schema is not exposed to anon or authenticated', () => {
  assert.match(migration, /revoke all on schema integration from public, anon, authenticated/);
  assert.match(migration, /grant usage on schema integration to service_role/);
});

test('deterministic reconciliation has explicit matched, new candidate and conflict states', () => {
  assert.match(reconcile, /status: 'matched'/);
  assert.match(reconcile, /status: 'new_candidate'/);
  assert.match(reconcile, /status: 'conflict'/);
  assert.match(reconcile, /confidence: 1/);
});
