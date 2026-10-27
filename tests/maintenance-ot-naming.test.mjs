import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const display = await readFile(new URL('../lib/maintenance/work-order-display.ts', import.meta.url), 'utf8');
const route = await readFile(new URL('../app/api/maintenance/work-orders/route.ts', import.meta.url), 'utf8');
const dictionaries = await readFile(new URL('../lib/i18n/dictionaries.ts', import.meta.url), 'utf8');
const migration = await readFile(
  new URL('../supabase/migrations/20261007204500_standardize_ot_work_order_naming.sql', import.meta.url),
  'utf8',
);

test('maintenance UI and new numbering use OT, never WO', () => {
  assert.match(display, /replace\(\/\^WO-\/i, 'OT-'\)/);
  assert.match(display, /replace\(\/\\bWO-\/gi, 'OT-'\)/);
  assert.match(route, /const prefix = isEmergencyWork \? `OTE-\$\{year\}-` : `OT-\$\{year\}-`/);
  assert.doesNotMatch(dictionaries, /\bWO\b/);
  assert.doesNotMatch(dictionaries, /\bWOs\b/);
});

test('migration safely normalizes legacy WO identifiers and drilling-created orders', () => {
  assert.match(migration, /regexp_replace\(work_order_number, '\^WO-', 'OT-'\)/);
  assert.match(migration, /Cannot rename WO identifiers to OT/);
  assert.match(migration, /v_number := 'OT-DRILL-'/);
});
