import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const payablesRoute = fs.readFileSync('app/api/finance/payables/route.ts', 'utf8');
const ledgerRoute = fs.readFileSync('app/api/finance/event-ledger/route.ts', 'utf8');

test('finance payables hides UAT fixtures from operational responses without deleting source data', () => {
  assert.match(payablesRoute, /const isUatValue/);
  assert.match(payablesRoute, /\^UAT-/);
  assert.match(payablesRoute, /visiblePayables/);
  assert.match(payablesRoute, /visiblePayments/);
  assert.doesNotMatch(payablesRoute, /delete\(|\.delete\(|DELETE FROM/i);
});

test('finance event ledger remains available when optional overview is restricted', () => {
  assert.match(ledgerRoute, /if \(eventsResult\.error\) throw eventsResult\.error/);
  assert.match(ledgerRoute, /if \(overviewResult\.error\)/);
  assert.match(ledgerRoute, /overview: overviewResult\.error \? null/);
  assert.match(ledgerRoute, /events: eventsResult\.data \|\| \[\]/);
});
