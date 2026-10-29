import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const files = [
  'lib/integrations/laudus/accounting-readiness.ts',
  'lib/integrations/laudus/finance-readiness.ts',
  'lib/integrations/laudus/master-readiness.ts',
  'lib/integrations/laudus/procurement-reconciliation.ts',
  'lib/integrations/laudus/stock-sync.ts',
];

test('Laudus readiness and stock paths avoid the private integration schema', () => {
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\.schema\('integration'\)/, file);
  }
});

test('Laudus readiness paths use public service views', () => {
  const accounting = fs.readFileSync(files[0], 'utf8');
  const finance = fs.readFileSync(files[1], 'utf8');
  const master = fs.readFileSync(files[2], 'utf8');
  const procurement = fs.readFileSync(files[3], 'utf8');

  assert.match(accounting, /laudus_source_status_service_v1/);
  assert.match(finance, /laudus_source_status_service_v1/);
  assert.match(master, /laudus_source_status_service_v1/);
  assert.match(master, /laudus_external_entity_links_service_v1/);
  assert.match(procurement, /purchase_order_reconciliation_preview_service_v1/);
});
