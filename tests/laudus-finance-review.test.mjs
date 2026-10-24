import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261024083500_laudus_finance_review_queue.sql','utf8');
const route = fs.readFileSync('app/api/integrations/laudus/finance-review/route.ts','utf8');
const page = fs.readFileSync('app/dashboard/finanzas/revisiones/page.tsx','utf8');

test('finance review queue is read-only and tenant scoped', () => {
  assert.match(migration, /p_organization_id uuid/);
  assert.match(migration, /where organization_id = p_organization_id/);
  assert.match(migration, /canonical_mutated',false/);
  assert.match(migration, /laudus_mutated',false/);
  assert.doesNotMatch(migration, /insert into public\.procurement/i);
  assert.doesNotMatch(migration, /update public\.procurement/i);
});

test('finance review prioritizes deterministic payable exceptions', () => {
  assert.match(migration, /Vencida/);
  assert.match(migration, /Falta vencimiento/);
  assert.match(migration, /Vence pronto/);
  assert.match(migration, /outstanding_amount desc/);
});

test('finance review API requires finance module access', () => {
  assert.match(route, /MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(route, /motil_laudus_finance_review_queue/);
});

test('finance review UI states that it cannot approve pay or account', () => {
  assert.match(page, /no aprueba, paga ni contabiliza/i);
  assert.match(page, /aprobación humana obligatoria/i);
  assert.match(page, /Three-way match OC → recepción\/guía → factura/);
});
