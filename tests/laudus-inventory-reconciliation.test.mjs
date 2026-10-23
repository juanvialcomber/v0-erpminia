import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261023130000_inventory_reconciliation_policy.sql', import.meta.url), 'utf8');
const logic = readFileSync(new URL('../lib/integrations/laudus/inventory-reconciliation.ts', import.meta.url), 'utf8');

test('inventory tolerance is explicit, private and defaults to zero', () => {
  assert.match(migration, /absolute_tolerance numeric not null default 0/);
  assert.match(migration, /approved_by uuid not null/);
  assert.match(migration, /where active/);
  assert.match(migration, /revoke all on integration\.inventory_reconciliation_policies from public, anon, authenticated/);
});

test('inventory reconciliation never auto-applies stock changes', () => {
  assert.match(logic, /autoApply: false/);
  assert.doesNotMatch(logic, /insert\(|update\(|upsert\(|delete\(/i);
});

test('physical count can identify ERP or operational divergence without mutating either source', () => {
  assert.match(logic, /erp_difference/);
  assert.match(logic, /operational_difference/);
  assert.match(logic, /multi_source_conflict/);
  assert.match(logic, /review_difference/);
});

test('unapproved tolerance is ignored', () => {
  assert.match(logic, /args\.policy\?\.approved/);
  assert.match(logic, /: 0;/);
});

test('unit mismatch is a hard review boundary', () => {
  assert.match(logic, /unit_conflict/);
  assert.match(logic, /Las fuentes usan unidades distintas/);
});
