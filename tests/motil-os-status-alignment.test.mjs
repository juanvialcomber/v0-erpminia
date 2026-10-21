import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Offline regression contract: no credentials, network, Supabase or operational writes.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const tower = read('../app/api/maintenance/control-tower/route.ts');
const calendar = read('../app/api/calendar/operational/route.ts');

function extractStatuses(source, pattern) {
  const match = source.match(pattern);
  assert.ok(match, 'Expected status contract not found in source');
  return [...match[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

const towerClosed = new Set(extractStatuses(tower, /function isClosed\([^)]*\)\s*\{\s*return \[([^\]]+)\]/));
const calendarHistorical = new Set(extractStatuses(calendar, /const CLOSED_STATUSES = new Set\(\[([\s\S]*?)\]\)/));

test('shared English completed and cancelled statuses are historical in both consumers', () => {
  for (const status of ['completed', 'closed', 'cancelled', 'canceled']) {
    assert.equal(towerClosed.has(status), true, `Tower: ${status}`);
    assert.equal(calendarHistorical.has(status), true, `Calendar: ${status}`);
  }
});

test('open, in_progress and paused are not treated as completed in either consumer', () => {
  for (const status of ['open', 'in_progress', 'paused']) {
    assert.equal(towerClosed.has(status), false, `Tower incorrectly closes ${status}`);
    assert.equal(calendarHistorical.has(status), false, `Calendar incorrectly closes ${status}`);
  }
});

test('document known calendar status extensions for OS contract alignment', () => {
  const extra = [...calendarHistorical].filter((status) => !towerClosed.has(status));
  assert.deepEqual(extra.sort(), [
    'cancelada','cerrada','completada','pagado','paid','realizada','received','reconciled','void','voided',
  ].sort());
  // A compatibility inventory, NOT an assertion that these statuses are interchangeable.
});
