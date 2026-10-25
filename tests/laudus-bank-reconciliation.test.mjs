import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const client = readFileSync(new URL('../lib/integrations/laudus/client.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/bank-reconciliation/route.ts', import.meta.url), 'utf8');

test('bank reconciliation uses Laudus read-only reconciliation endpoints', () => {
  assert.match(client, /bankStatementNotInJournal/);
  assert.match(client, /journalNotInBankStatement/);
  assert.match(client, /includeOtherBankStatements/);
  assert.match(client, /dateTo.*DESC/s);
  assert.match(client, /persisted: false/);
});

test('bank reconciliation route is finance scoped and GET only', () => {
  assert.match(route, /MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /POST|PUT|PATCH|DELETE/);
});
